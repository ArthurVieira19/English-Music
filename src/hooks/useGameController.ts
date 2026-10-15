"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Song } from "@/types/Song"
import type { GameMode } from "@/types/GameMode"
import type { ExerciseLine } from "@/types/ExerciseLine"
import type { GameResult } from "@/types/Achievement"
import { YouTubePlayer } from "@/modules/player/youtubePlayer"
import { OffsetMediaPlayer } from "@/modules/player/OffsetMediaPlayer"
import { clampOffset, offsetFromTap } from "@/modules/game/syncOffset"
import { lineEndState } from "@/modules/game/lineEndGuard"
import { levelId, promotionAfter, resolveCurrentLevel, type Level } from "@/modules/game/levels"
import { GameSynchronizer } from "@/modules/game/GameSynchronizer"
import { groupLyricLines } from "@/modules/lyrics/groupLyricLines"
import { buildVocabularyPool, generateSongExercises } from "@/modules/game/exerciseGenerator"
import { normalize, validateAnswer } from "@/modules/game/answerValidator"
import { analyzeMistake } from "@/modules/game/mistakeAnalyzer"
import { MAX_ATTEMPTS, calculateStars, scoreAnswer } from "@/modules/game/scoreEngine"
import { effectiveScoreMode } from "@/modules/leaderboard/songScores"
import { songScoreService } from "@/services/leaderboard/songScoreService"
import { evaluateAchievements, toAchievement } from "@/modules/achievements/achievementEngine"
import { usePlayerStore } from "@/stores/playerStore"
import { answeredTokenKey, useGameStore } from "@/stores/gameStore"
import { useStatsStore } from "@/stores/statsStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useAchievementStore } from "@/stores/achievementStore"
import { useReviewStore } from "@/stores/reviewStore"
import { findSourceLine } from "@/modules/review/reviewClip"

const YOUTUBE_STATE_PLAYING = 1
/** Only the rewind buttons' -10s/-5s math reads this from the store, so 5Hz is plenty; GameSynchronizer tracks its own per-frame clock for lyric sync. */
const CURRENT_TIME_UPDATE_INTERVAL_MS = 200
/**
 * After the sync offset changes the clock jumps, so the synchronizer may move
 * the active line backwards or forwards. That is the player correcting the
 * lyrics, not skipping a line, so it must not trigger the "you missed a line"
 * pause. Long enough to cover the next animation frame, short enough that a
 * real line change soon after still behaves normally.
 */
const OFFSET_SETTLE_MS = 300

/**
 * A hidden token the player hasn't resolved yet — still waiting on an answer.
 * One that was answered wrong has used up its attempts and is already
 * revealed, so it counts as resolved (a skipped line's blanks land here too).
 */
function isIncompleteToken(
  line: ExerciseLine,
  lineIndex: number,
  answeredTokens: Record<string, boolean>,
): boolean {
  return line.tokens.some(
    (token) => token.isHidden && !(answeredTokenKey(lineIndex, token.index) in answeredTokens),
  )
}

/** Volume changes smaller than this aren't sent to the player, which would otherwise get one every frame of a fade. */
const VOLUME_STEP = 0.05

/**
 * Wires the pure engine modules (player abstraction, synchronizer, exercise
 * generator, validator, scoring, achievements) to the Zustand stores for a
 * single game session. No game logic lives here beyond orchestration.
 */
export function useGameController(
  song: Song,
  elementId: string,
  level: Level,
  mode: GameMode,
) {
  const difficulty = level.difficulty
  const levelKey = levelId(level)
  const settings = useSettingsStore((s) => s.settings)
  const playerStore = usePlayerStore()
  const gameStore = useGameStore()
  const achievements = useAchievementStore()

  /** Everything the game does with the video goes through this wrapper, so the game only ever sees lyric time. */
  const playerRef = useRef<OffsetMediaPlayer | null>(null)
  const offsetSettlesAtRef = useRef(0)
  const syncRef = useRef<GameSynchronizer | null>(null)
  const lineStartedAtRef = useRef<number>(Date.now())
  const sessionStartRef = useRef<number>(Date.now())
  /** The server-issued pass for this playthrough, or null if ranking is unavailable. See songScoreService. */
  const playPassRef = useRef<Promise<string | null>>(Promise.resolve(null))
  /** The volume multiplier last applied by the end-of-line fade; 1 means untouched. */
  const fadeVolumeRef = useRef(1)

  const [isReady, setIsReady] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [lastResult, setLastResult] = useState<GameResult | null>(null)
  const [syncOffset, setSyncOffsetState] = useState(0)

  const distractorPool = useMemo(() => buildVocabularyPool(song.lyrics), [song])

  useEffect(() => {
    gameStore.reset()
    playerStore.reset()
    setIsComplete(false)
    setLastResult(null)
    sessionStartRef.current = Date.now()
    lineStartedAtRef.current = Date.now()
    const savedOffset = useSettingsStore.getState().getSongOffset(song.id)
    setSyncOffsetState(savedOffset)
    // Fire and forget: the pass only matters when the song ends, and a failed
    // request just means this playthrough isn't ranked — never a blocked game.
    playPassRef.current = songScoreService.startPlay(song.id)

    // Fresh per playthrough so the hidden words vary each time the song is
    // played — stable for the rest of this session (retries/rewinds don't
    // reshuffle mid-attempt), but different from the last time you played it.
    const sessionSeed = Math.random().toString(36).slice(2)

    // Groups quickly-timestamped LRC lines into bigger chunks so each one
    // stays on screen long enough to read and answer — the synchronizer
    // below is driven by these same grouped lines, so its active-line
    // index always lines up with `exercises`.
    const lyrics = groupLyricLines(song.lyrics)

    // Built song-wide so a repeated chorus doesn't hide the same word every time.
    const exercises = generateSongExercises(lyrics, {
      level,
      mode,
      seedPrefix: `${song.id}:${sessionSeed}`,
      distractorPool,
    })

    gameStore.setExercises(exercises)
    gameStore.setDifficulty(difficulty)
    gameStore.setMode(mode)
    playerStore.setSong(song)

    const youtube = new YouTubePlayer({
      elementId,
      videoId: song.youtubeId,
      onReady: () => {
        // Applied once at startup, not kept in sync afterward — the only way
        // to change it is the Settings page, which isn't reachable without
        // unmounting this session first.
        youtube.setVolume(useSettingsStore.getState().settings.volume)
        setIsReady(true)
      },
      onStateChange: (state) => {
        // Playback can be resumed from YouTube's own controls too, bypassing
        // play(); whatever started it, it must not carry on at a faded volume.
        if (state === YOUTUBE_STATE_PLAYING) restoreVolume()
        playerStore.setIsPlaying(state === YOUTUBE_STATE_PLAYING)
      },
    })
    const player = new OffsetMediaPlayer(youtube, savedOffset)
    playerRef.current = player

    const sync = new GameSynchronizer(player, lyrics)
    sync.onChange((_line, index) => {
      const state = useGameStore.getState()
      const previousIndex = state.activeExerciseIndex
      const previousLine = state.exercises[previousIndex]

      const settlingOffset = performance.now() < offsetSettlesAtRef.current

      const missedPreviousLine =
        !settlingOffset &&
        previousLine &&
        previousIndex >= 0 &&
        previousIndex !== index &&
        isIncompleteToken(previousLine, previousIndex, state.answeredTokens)

      if (missedPreviousLine && previousLine) {
        // Pause right here instead of letting playback bleed into the next
        // line — the player gets unlimited time to answer or replay this
        // line, rather than a fixed countdown racing against a rewind.
        player.pause()
        useGameStore.getState().setPendingRetry(previousIndex)
        return
      }

      useGameStore.getState().setActiveExerciseIndex(index)
      lineStartedAtRef.current = Date.now()
    })
    sync.start()
    syncRef.current = sync

    return () => {
      sync.stop()
      player.destroy()
      playerRef.current = null
      syncRef.current = null
    }
    // Re-run only when the song, its element, or the chosen level/mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, elementId, levelKey, mode])

  useEffect(() => {
    let rafId: number
    let lastUpdate = 0

    const tick = (now: number) => {
      const player = playerRef.current
      guardLineEnd()
      if (player && now - lastUpdate >= CURRENT_TIME_UPDATE_INTERVAL_MS) {
        lastUpdate = now
        usePlayerStore.getState().setCurrentTime(player.getCurrentTime())
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // guardLineEnd only reads refs and store snapshots, so the first one is as good as any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFadeVolume(factor: number) {
    const player = playerRef.current
    if (!player) return
    fadeVolumeRef.current = factor
    player.setVolume(useSettingsStore.getState().settings.volume * factor)
  }

  /** Undoes the end-of-line fade, if one is in effect. */
  function restoreVolume() {
    if (fadeVolumeRef.current !== 1) applyFadeVolume(1)
  }

  /**
   * Runs every frame. While the active line still has open blanks, eases the
   * volume out over its last moment and stops just before it ends, so the
   * player waits on the line they need to answer instead of hearing the next
   * one begin. The synchronizer's "missed a line" pause stays as the safety
   * net for anything that slips past this (a seek, a stalled frame).
   */
  function guardLineEnd() {
    const player = playerRef.current
    const state = useGameStore.getState()
    if (!player || !usePlayerStore.getState().isPlaying || state.pendingRetryLineIndex !== null) return

    const lineIndex = state.activeExerciseIndex
    const line = state.exercises[lineIndex]
    if (!line || !isIncompleteToken(line, lineIndex, state.answeredTokens)) {
      restoreVolume()
      return
    }

    const { volume, pause: shouldPause } = lineEndState(player.getCurrentTime(), line.end)
    if (shouldPause) {
      player.pause()
      state.setPendingRetry(lineIndex)
      return
    }

    if (volume === 1) restoreVolume()
    else if (Math.abs(volume - fadeVolumeRef.current) >= VOLUME_STEP) applyFadeVolume(volume)
  }

  function play() {
    restoreVolume()
    playerRef.current?.play()
  }

  function pause() {
    playerRef.current?.pause()
  }

  function seek(seconds: number) {
    playerRef.current?.seek(seconds)
  }

  /**
   * Shifts the lyrics against the video, live and without touching any answer,
   * and remembers the correction for this song on the player's account.
   */
  function setSyncOffset(seconds: number) {
    const offset = clampOffset(seconds)
    const player = playerRef.current
    if (!player || offset === player.getOffset()) return

    offsetSettlesAtRef.current = performance.now() + OFFSET_SETTLE_MS
    player.setOffset(offset)
    // The synchronizer keeps a line index of its own; this makes it re-announce
    // the line the new clock lands on instead of assuming nothing changed.
    syncRef.current?.resync()
    setSyncOffsetState(offset)
    useSettingsStore.getState().setSongOffset(song.id, offset)
  }

  /**
   * One-tap calibration: the player taps the moment the highlighted line is
   * actually sung. The tap time, less a human reaction delay, is when that
   * line really starts in the video, which fixes the offset in one go.
   * Returns false when there is nothing sensible to calibrate against.
   */
  function syncToCurrentLine(): boolean {
    const state = useGameStore.getState()
    const player = playerRef.current
    const line = state.exercises[state.activeExerciseIndex]
    if (!player || !line || state.pendingRetryLineIndex !== null) return false

    setSyncOffset(offsetFromTap({ rawTime: player.getRawTime(), lineStart: line.start }))
    return true
  }

  /** Slows down or speeds up playback — handy for rap verses and fast passages. */
  function setPlaybackRate(rate: number) {
    playerRef.current?.setPlaybackRate(rate)
    playerStore.setPlaybackRate(rate)
  }

  /**
   * Feeds an answered token's outcome into the cross-song weak-word pool
   * (see reviewStore) — wrong answers get resurfaced later in Review mode;
   * a correct answer for a word already flagged as weak nudges it toward
   * mastery. Words never missed are never tracked here.
   */
  function recordWeakWordOutcome(line: ExerciseLine, token: { index: number; answer?: string }, isCorrect: boolean) {
    if (!token.answer) return
    const word = normalize(token.answer)
    if (!word) return

    // The game plays chunks of several lyric lines; Review only needs the one
    // line the word is in, so it replays that exact moment of the video. A word
    // is tracked per line of a song, so a right answer only counts for the
    // entry made in this same line.
    const source = findSourceLine(song.lyrics, line, token.index)
    const contextText = source?.text ?? line.text

    if (isCorrect) {
      useReviewStore.getState().recordCorrect({ word, songId: song.id, contextText })
    } else {
      useReviewStore.getState().recordMiss(word, {
        songId: song.id,
        songTitle: song.title,
        artist: song.artist,
        contextText,
        clip: { start: source?.start ?? line.start, end: source?.end ?? line.end },
      })
    }
  }

  function countHiddenTokens(exercises: ReturnType<typeof useGameStore.getState>["exercises"]) {
    return exercises.reduce((sum, ex) => sum + ex.tokens.filter((t) => t.isHidden).length, 0)
  }

  function finishSong() {
    const state = useGameStore.getState()
    const accuracy = state.totalAnswers > 0 ? (state.correctAnswers / state.totalAnswers) * 100 : 0
    const now = Date.now()

    const blanks = countHiddenTokens(state.exercises)
    const result: GameResult = {
      songId: song.id,
      score: state.score,
      accuracy,
      combo: state.combo,
      maxCombo: state.maxCombo,
      correctAnswers: state.correctAnswers,
      totalAnswers: state.totalAnswers,
      playTimeMs: now - sessionStartRef.current,
      difficulty: state.difficulty,
      mode: effectiveScoreMode(state.difficulty, state.mode),
      blanks,
      stars: calculateStars(state.score, blanks),
      level: levelKey,
    }

    // A strong run at the player's own level (or above) moves them up a step,
    // so the setup screen offers a little more next time.
    const savedSettings = useSettingsStore.getState().settings
    const promotion = promotionAfter(
      level,
      resolveCurrentLevel(savedSettings.currentLevel, savedSettings.defaultDifficulty),
      result.stars ?? 0,
    )
    if (promotion) {
      result.levelUp = levelId(promotion)
      useSettingsStore.getState().updateSettings({
        currentLevel: result.levelUp,
        defaultDifficulty: promotion.difficulty,
      })
    }

    useStatsStore.getState().recordSongResult(
      { songId: song.id, score: result.score, accuracy: result.accuracy, completedAt: now, playTimeMs: result.playTimeMs },
      result.score,
      now,
    )

    const { statistics, progress } = useStatsStore.getState()
    const alreadyUnlocked = useAchievementStore.getState().achievements.map((a) => a.id)
    const newlyUnlocked = evaluateAchievements({ result, statistics, progress }, alreadyUnlocked)

    if (newlyUnlocked.length > 0) {
      useAchievementStore
        .getState()
        .unlockAchievements(newlyUnlocked.map((rule) => toAchievement(rule, now)))
    }

    useGameStore.getState().setLastResult(result)
    setLastResult(result)
    setIsComplete(true)
    pause()
    void submitRankedScore(result)
  }

  /**
   * Spends the play pass on this result so it can land on the song's ranking.
   * Runs after the game has already ended, so a slow or failed request never
   * touches the gameplay — the Results page just shows whatever came back.
   */
  async function submitRankedScore(result: GameResult) {
    const store = useGameStore.getState()
    const { mode: scoreMode, blanks } = result
    if (!scoreMode || !blanks) {
      store.setScoreSubmission({ status: "skipped" })
      return
    }

    store.setScoreSubmission({ status: "pending" })
    const playId = await playPassRef.current
    const submission = playId
      ? await songScoreService.submit(playId, {
          difficulty: result.difficulty,
          mode: scoreMode,
          score: result.score,
          blanks,
          correctAnswers: result.correctAnswers,
          playTimeMs: result.playTimeMs,
        })
      : null

    // A new game may have started while the request was in flight; its reset
    // already cleared this result, and a late answer must not resurrect it.
    if (useGameStore.getState().lastResult !== result) return
    useGameStore
      .getState()
      .setScoreSubmission(submission ? { status: "saved", submission } : { status: "skipped" })
  }

  function submitAnswer(exerciseIndex: number, tokenIndex: number, userInput: string) {
    const state = useGameStore.getState()
    const line = state.exercises[exerciseIndex]
    if (!line) return null

    const token = line.tokens[tokenIndex]
    if (!token || !token.isHidden || !token.answer) return null

    const alreadyRevealed = answeredTokenKey(exerciseIndex, tokenIndex) in state.answeredTokens
    if (alreadyRevealed) return null

    const { isCorrect } = validateAnswer(userInput, token.answer, { fuzzy: settings.fuzzyMatching })

    // Each blank gets MAX_ATTEMPTS guesses. A wrong one that still leaves
    // attempts to spare just marks the blank and lets the player try again —
    // nothing is scored, revealed, or added to the combo until it's resolved.
    const attempt = (state.wrongGuesses[answeredTokenKey(exerciseIndex, tokenIndex)]?.length ?? 0) + 1
    // Why the guess was wrong, when it falls into a known listening pattern —
    // shown as a hint on a retry, and as the full explanation once resolved.
    const insight = isCorrect ? null : analyzeMistake(userInput, token.answer)
    if (!isCorrect && attempt < MAX_ATTEMPTS) {
      gameStore.recordWrongGuess(exerciseIndex, tokenIndex, userInput)
      return {
        isCorrect: false,
        isFinal: false,
        attemptsLeft: MAX_ATTEMPTS - attempt,
        points: 0,
        insight,
        guess: userInput,
        answer: token.answer,
      }
    }

    const responseTimeMs = Date.now() - lineStartedAtRef.current
    const timeLimitMs = Math.max(1000, (line.end - line.start) * 1000)

    const result = scoreAnswer({ isCorrect, responseTimeMs, timeLimitMs, combo: state.combo, attempt })
    // Needing a second try means the word wasn't caught by ear, so it still
    // goes into the weak-word pool even though it was eventually right.
    recordWeakWordOutcome(line, token, isCorrect && attempt === 1)

    gameStore.applyAnswer({
      exerciseIndex,
      tokenIndex,
      points: result.points,
      isCorrect,
      newCombo: result.newCombo,
    })

    const updated = useGameStore.getState()

    // Filling in the last blank of a paused-for-retry line is itself the
    // "continue" action — no need to also click the retry button.
    if (
      updated.pendingRetryLineIndex === exerciseIndex &&
      !isIncompleteToken(line, exerciseIndex, updated.answeredTokens)
    ) {
      gameStore.setPendingRetry(null)
      // The synchronizer already silently advanced past this line the
      // moment it paused (it just withheld the store update while retry was
      // pending) — resuming without seeking back means its internal index
      // won't change again on the next tick, so it'd never notify the store
      // and the *next* line after this one would get skipped entirely.
      syncRef.current?.resync()
      play()
    }

    const totalHidden = countHiddenTokens(updated.exercises)
    if (totalHidden > 0 && updated.totalAnswers >= totalHidden) {
      finishSong()
    }

    return { isCorrect, isFinal: true, attemptsLeft: 0, insight, guess: userInput, answer: token.answer, ...result }
  }

  /** Replays the paused line from its start after the player asks to hear it again. */
  function retryLine() {
    const state = useGameStore.getState()
    const lineIndex = state.pendingRetryLineIndex
    if (lineIndex === null) return

    const line = state.exercises[lineIndex]
    if (!line) return

    gameStore.setPendingRetry(null)
    lineStartedAtRef.current = Date.now()
    playerRef.current?.seek(Math.max(0, line.start))
    play()
  }

  /**
   * Replays the line that's currently on screen from its start, on demand and
   * without disturbing answers already given — the "say that again" button.
   * When playback is paused waiting on a retry it simply does that retry.
   * Seeks to the line's exact start (never before it) so the synchronizer
   * doesn't see the previous line and pause on the one being replayed.
   */
  function replayLine() {
    const state = useGameStore.getState()
    if (state.pendingRetryLineIndex !== null) {
      retryLine()
      return
    }

    const line = state.exercises[state.activeExerciseIndex]
    if (!line) return

    lineStartedAtRef.current = Date.now()
    playerRef.current?.seek(Math.max(0, line.start))
    play()
  }

  /**
   * Reveals every still-unanswered blank in the current line as a miss and
   * moves on — for when the player doesn't know the word and would rather
   * not guess or sit through a replay. Works whether the line is actively
   * playing or already paused waiting for a retry.
   */
  function skipLine() {
    const state = useGameStore.getState()
    const lineIndex = state.pendingRetryLineIndex ?? state.activeExerciseIndex
    const line = state.exercises[lineIndex]
    if (!line) return

    revealAsMisses(
      lineIndex,
      line.tokens.filter((token) => token.isHidden).map((token) => token.index),
    )
    lineStartedAtRef.current = Date.now()
    play()
  }

  /**
   * Gives up on a single blank — the first open one in the current line unless
   * one is named — revealing it as a miss. Bound to Enter in an empty blank and
   * to a sideways swipe on phones. If that was the line's last open blank
   * while the song waited on it, the song carries on.
   */
  function skipWord(tokenIndex?: number) {
    const state = useGameStore.getState()
    const lineIndex = state.pendingRetryLineIndex ?? state.activeExerciseIndex
    const line = state.exercises[lineIndex]
    if (!line) return

    const token =
      tokenIndex === undefined
        ? line.tokens.find((t) => t.isHidden && !(answeredTokenKey(lineIndex, t.index) in state.answeredTokens))
        : line.tokens[tokenIndex]
    if (!token || !token.isHidden) return

    revealAsMisses(lineIndex, [token.index])
  }

  /**
   * Marks the given blanks of a line as misses (ones already resolved are left
   * alone). If the song was paused waiting on that line and nothing on it is
   * left open, playback resumes; if that was the last blank, the song ends.
   */
  function revealAsMisses(lineIndex: number, tokenIndices: number[]) {
    const line = useGameStore.getState().exercises[lineIndex]
    if (!line) return

    for (const tokenIndex of tokenIndices) {
      const token = line.tokens[tokenIndex]
      if (!token?.isHidden) continue
      if (answeredTokenKey(lineIndex, token.index) in useGameStore.getState().answeredTokens) continue

      const result = scoreAnswer({ isCorrect: false, responseTimeMs: 0, timeLimitMs: 0, combo: 0 })
      recordWeakWordOutcome(line, token, false)
      gameStore.applyAnswer({
        exerciseIndex: lineIndex,
        tokenIndex: token.index,
        points: result.points,
        isCorrect: false,
        newCombo: result.newCombo,
      })
    }

    const updated = useGameStore.getState()
    if (updated.pendingRetryLineIndex === lineIndex && !isIncompleteToken(line, lineIndex, updated.answeredTokens)) {
      gameStore.setPendingRetry(null)
      // Same reason as submitAnswer's auto-continue: resuming without seeking
      // back needs a resync so the synchronizer notifies the store once
      // playback reaches the next line instead of skipping it.
      syncRef.current?.resync()
      play()
    }

    const totalHidden = countHiddenTokens(updated.exercises)
    if (totalHidden > 0 && updated.totalAnswers >= totalHidden) {
      finishSong()
    }
  }

  /**
   * Jumps to a clicked line in the lyrics panel: seeks the video there *and*
   * makes that line the active, writable one right away — clearing its
   * blanks back to editable instead of leaving them shown as already
   * answered (or static) until the synchronizer's next tick catches up.
   */
  function seekToLine(lineIndex: number) {
    const state = useGameStore.getState()
    const line = state.exercises[lineIndex]
    if (!line) return

    line.tokens.forEach((token) => {
      if (token.isHidden) {
        gameStore.unanswerToken(lineIndex, token.index)
      }
    })

    gameStore.setPendingRetry(null)
    gameStore.setActiveExerciseIndex(lineIndex)
    lineStartedAtRef.current = Date.now()
    playerRef.current?.seek(Math.max(0, line.start))
  }

  return {
    isReady,
    isComplete,
    lastResult,
    play,
    pause,
    seek,
    setPlaybackRate,
    syncOffset,
    setSyncOffset,
    syncToCurrentLine,
    submitAnswer,
    retryLine,
    replayLine,
    skipLine,
    skipWord,
    seekToLine,
    achievementsCount: achievements.achievements.length,
  }
}
