"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CircleHelp, Flame, Pause, Play, Repeat, RotateCcw, SkipForward, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Song } from "@/types/Song";
import type { GameMode } from "@/types/GameMode";
import { useGameController } from "@/hooks/useGameController";
import { useGameShortcuts } from "@/hooks/useGameShortcuts";
import { useOnScreenKeyboard } from "@/hooks/useOnScreenKeyboard";
import { isTextField } from "@/modules/game/onScreenKeyboard";
import { GAME_SHORTCUT_LEGEND } from "@/modules/game/gameShortcuts";
import { useGameStore } from "@/stores/gameStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { LyricsPanel } from "@/components/lyrics-panel";
import { ExerciseChoicesView } from "@/components/exercise-line";
import { PlaybackRateControl } from "@/components/playback-rate-control";
import { SyncControl } from "@/components/sync-control";
import { WordBank } from "@/components/word-bank";
import { levelLabel, type Level } from "@/modules/game/levels";
import { hashStringToSeed } from "@/modules/game/seededRandom";
import { MistakeNote, type MistakeNoteData } from "@/components/mistake-note";
import { AmbientArt } from "@/components/ambient-art";
import { DifficultyMeter, SongThumbnail } from "@/components/song-card";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Combo at which the HUD starts "burning" — early enough to feel reachable. */
const HOT_COMBO = 3;

type ScoreFlash = { id: number; label: string; tone: "hit" | "miss" };

export function GameScreen({
  song,
  level,
  mode,
}: {
  song: Song;
  level: Level;
  mode: GameMode;
}) {
  const router = useRouter();
  const elementId = `youtube-player-${song.id}`;
  const controller = useGameController(song, elementId, level, mode);
  const screenRef = useRef<HTMLDivElement>(null);
  // With the phone's keyboard up there are only ~400px left, so the screen
  // turns into a compact overlay sized to what is still visible.
  const keyboardOpen = useOnScreenKeyboard(screenRef);

  const exercises = useGameStore((s) => s.exercises);
  const activeExerciseIndex = useGameStore((s) => s.activeExerciseIndex);
  const answeredTokens = useGameStore((s) => s.answeredTokens);
  const wrongGuesses = useGameStore((s) => s.wrongGuesses);
  const score = useGameStore((s) => s.score);
  const combo = useGameStore((s) => s.combo);
  const totalAnswers = useGameStore((s) => s.totalAnswers);
  const pendingRetryLineIndex = useGameStore((s) => s.pendingRetryLineIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const fuzzyMatching = useSettingsStore((s) => s.settings.fuzzyMatching);

  const [flash, setFlash] = useState<ScoreFlash | null>(null);
  const [note, setNote] = useState<MistakeNoteData | null>(null);
  // Mirrors each answer's outcome as plain text for screen readers — the visual flash above is aria-hidden.
  const [announcement, setAnnouncement] = useState("");
  const dismissNote = useCallback(() => setNote(null), []);

  const activeLine = exercises[activeExerciseIndex];
  const isPausedForRetry = pendingRetryLineIndex !== null;
  const hasAnswerButtons = mode === "multipleChoice" || mode === "wordBank";
  // Dense lines fall back to typing even in Choice mode (see
  // exerciseGenerator's forcedTyping), so check for real choices to show.
  const hasPendingChoice =
    activeLine?.tokens.some(
      (token) => token.choices && !(`${activeExerciseIndex}:${token.index}` in answeredTokens),
    ) ?? false;

  const totalHidden = exercises.reduce(
    (sum, exercise) => sum + exercise.tokens.filter((token) => token.isHidden).length,
    0,
  );
  const progress = totalHidden > 0 ? totalAnswers / totalHidden : 0;

  useEffect(() => {
    if (controller.isComplete) {
      router.push("/results");
    }
  }, [controller.isComplete, router]);

  function handleSubmit(tokenIndex: number, value: string) {
    const result = controller.submitAnswer(activeExerciseIndex, tokenIndex, value);
    if (!result) return;
    // Feedback lands right next to the score instead of in a toast: a toast
    // per answer piles up and pulls the eye away from the lyrics.
    const id = Date.now();
    setFlash({
      id,
      label: result.isCorrect ? `+${result.points}` : result.isFinal ? "miss" : "try again",
      tone: result.isCorrect ? "hit" : "miss",
    });

    if (result.isCorrect) {
      setNote(null);
      setAnnouncement(`Correct, plus ${result.points} points.`);
    } else if (result.insight) {
      // Mid-try, only hint at the kind of slip — the word itself stays hidden.
      setNote({
        id,
        tone: result.isFinal ? "explain" : "nudge",
        guess: result.guess,
        answer: result.answer,
        text: result.isFinal ? result.insight.explanation : result.insight.nudge,
      });
      setAnnouncement(
        result.isFinal ? `Incorrect. ${result.insight.explanation}` : `Not quite. ${result.insight.nudge}`,
      );
    } else {
      setAnnouncement(result.isFinal ? `Incorrect. The word was ${result.answer}.` : "Not quite. Try again.");
    }
  }

  function togglePlayback() {
    if (isPlaying) controller.pause();
    else controller.play();
  }

  function rewind(seconds: number) {
    controller.seek(Math.max(0, currentTime - seconds));
  }

  useGameShortcuts(
    {
      togglePlayback,
      replayLine: controller.replayLine,
      skipLine: controller.skipLine,
      rewind5: () => rewind(5),
    },
    controller.isReady && !controller.isComplete,
  );

  const mistakeNote = (
    <AnimatePresence initial={false}>
      {note && (
        <MistakeNote
          key={note.id}
          note={note}
          onDismiss={dismissNote}
          className={cn("absolute inset-x-2 top-2 shadow-lg", keyboardOpen ? "z-30" : "z-20")}
        />
      )}
    </AnimatePresence>
  );

  const hud = (
    <GameHud score={score} combo={combo} flash={flash} onFlashDone={(id) => setFlash((current) => (current?.id === id ? null : current))} />
  );

  return (
    // Exactly one viewport tall (below the 4rem header), so every control is on
    // screen without scrolling: only the lyrics panel scrolls. Things that come
    // and go (the paused notice, mistake notes) float over the video instead of
    // pushing the answer buttons around. `data-game-screen` drops main's
    // tab-bar padding (see globals.css): the controls are docked in here.
    //
    // With the on-screen keyboard up, `dvh` doesn't shrink (the keyboard just
    // covers the page), so the screen becomes a fixed overlay over the header,
    // exactly as tall as what is still visible (--vvh, from
    // useOnScreenKeyboard): small video with the score beside it, the lyrics,
    // and only the replay / play / skip buttons.
    <div
      ref={screenRef}
      data-game-screen
      data-keyboard-open={keyboardOpen || undefined}
      onMouseDown={keyboardOpen ? keepTypingFocus : undefined}
      className={cn(
        "relative isolate mx-auto flex max-w-7xl flex-col gap-2 px-4 pt-2 lg:gap-4 lg:pt-4 lg:pb-4",
        keyboardOpen
          ? "fixed inset-x-0 top-[var(--vv-top)] z-50 h-[var(--vvh)] gap-2 bg-background pt-2"
          : "h-[calc(100dvh-4rem-1px)] min-h-[32rem]",
      )}
    >
      <AmbientArt song={song} className="lg:-top-8" />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {keyboardOpen && mistakeNote}
      <div className={cn("flex shrink-0 items-center justify-between gap-3", keyboardOpen && "hidden lg:flex")}>
        <div className="flex min-w-0 items-center gap-3">
          <SongThumbnail song={song} className="hidden w-16 shrink-0 rounded-md ring-1 ring-foreground/10 sm:block" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold lg:text-lg">{song.title}</h1>
            <p className="hidden items-center gap-2 truncate sm:flex text-sm text-muted-foreground">
              <span className="truncate">{song.artist}</span>
              <span aria-hidden className="hidden sm:inline">·</span>
              <DifficultyMeter difficulty={level.difficulty} label={levelLabel(level)} className="hidden sm:inline-flex" />
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <GameHelp />
          {hud}
        </div>
      </div>

      {/* Phones: video, lyrics, then the answer buttons and controls docked at
          the bottom (thumb reach). From lg: video and dock on the left, the
          lyrics filling the right column. */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 [grid-template-areas:'video'_'lyrics'_'dock'] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-4 lg:[grid-template-areas:'video_lyrics'_'dock_lyrics']",
          keyboardOpen && "gap-2",
        )}
      >
        {/* From lg the video takes whatever height is left over: the 16:9 box
            is the largest that fits this area (container query units). With
            the keyboard up it shrinks to a quarter of what is visible, with
            the score beside it (the title row is hidden). The player stays
            mounted either way: moving or hiding it would stop the music. */}
        <div className={cn("[grid-area:video] lg:[container-type:size]", keyboardOpen && "flex items-center gap-3 lg:block")}>
          <div
            className={cn(
              "relative mx-auto aspect-video overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-shadow duration-500 lg:w-[min(100cqw,calc(100cqh*16/9))] lg:max-w-none",
              keyboardOpen
                ? "mx-0 h-[calc(var(--vvh)*0.25)] w-auto shrink-0 lg:mx-auto lg:h-auto"
                : // Choice and word bank need room for their buttons, so the video gives up a little.
                  cn("w-full", hasAnswerButtons ? "max-w-[calc(24dvh*16/9)]" : "max-w-[calc(30dvh*16/9)]"),
              isPlaying && "shadow-[0_0_0_1px_var(--glow-primary)]",
            )}
          >
            <div className="yt-frame absolute inset-0 overflow-hidden bg-black">
              <div id={elementId} className="absolute inset-0" />
              {!controller.isReady && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-card" aria-hidden />
              )}
            </div>

            {/* Too small to hold a note with the keyboard up: it floats over the top of the screen then. */}
            {!keyboardOpen && mistakeNote}

            {/* The video is stopped while this shows, so it covers nothing worth watching. */}
            <AnimatePresence initial={false}>
              {isPausedForRetry && (
                <motion.div
                  role="status"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className={cn(
                    "absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pt-8 pb-3 sm:px-4",
                    keyboardOpen && "justify-center px-2 pt-2 pb-2 sm:px-2",
                  )}
                >
                  <p className={cn("text-sm text-white/80", keyboardOpen && "sr-only")}>
                    <span className="font-semibold text-white">Paused.</span> Didn&apos;t catch it?
                  </p>
                  <button
                    type="button"
                    onClick={controller.retryLine}
                    className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-150 hover:scale-[1.03] active:scale-95"
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Replay line
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {keyboardOpen && <div className="flex min-w-0 flex-col items-start gap-1.5 lg:hidden">{hud}</div>}
        </div>

        <div className="min-h-0 [grid-area:lyrics]">
          <LyricsPanel
            compact={keyboardOpen}
            exercises={exercises}
            activeExerciseIndex={activeExerciseIndex}
            answeredTokens={answeredTokens}
            wrongGuesses={wrongGuesses}
            onSubmit={handleSubmit}
            onLineClick={controller.seekToLine}
            fuzzy={fuzzyMatching}
            onReplay={controller.replayLine}
            onSkipWord={controller.skipWord}
          />
        </div>

        <div className="flex flex-col gap-2 [grid-area:dock]">
          {/* Always there in Choice mode, empty slots between blanks, so the
              buttons never jump and the video never resizes under them. */}
          {/* With the keyboard up the line being typed is a typed one, so the empty slots would only take room. */}
          {mode === "multipleChoice" && !(keyboardOpen && !hasPendingChoice) && (
            <div className="glass rounded-2xl p-2 sm:p-3">
              {activeLine && hasPendingChoice ? (
                <ExerciseChoicesView
                  line={activeLine}
                  exerciseIndex={activeExerciseIndex}
                  answeredTokens={answeredTokens}
                  wrongGuesses={wrongGuesses}
                  onSubmit={handleSubmit}
                />
              ) : (
                <div aria-hidden className="grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-4">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="min-h-11 rounded-xl border border-dashed border-border/50" />
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "wordBank" && activeLine?.mode === "wordBank" && (
            <div className="glass rounded-2xl p-2 sm:p-3">
              <WordBank
                exercises={exercises}
                lineIndex={activeExerciseIndex}
                answeredTokens={answeredTokens}
                wrongGuesses={wrongGuesses}
                seed={hashStringToSeed(song.id)}
                onPick={handleSubmit}
              />
            </div>
          )}

          {/* Full-bleed bar on phones, a card from lg up. */}
          {/* Below lg the progress is a thin line along its top edge, not a
              row of its own. With the keyboard up: only replay / play / skip,
              and no home-indicator padding (the keyboard covers it). */}
          <div
            className={cn(
              "glass relative -mx-4 border-x-0 border-b-0 px-4 pt-2.5 lg:mx-0 lg:rounded-2xl lg:border lg:px-4 lg:py-3",
              keyboardOpen ? "pb-2 pt-2" : "safe-bottom",
            )}
          >
            <div className="flex flex-col gap-2.5">
              <div className="absolute inset-x-0 top-0 flex items-center gap-3 lg:static">
                <div
                  role="progressbar"
                  aria-label="Song completion"
                  aria-valuemin={0}
                  aria-valuemax={totalHidden}
                  aria-valuenow={totalAnswers}
                  aria-valuetext={`${totalAnswers} of ${totalHidden} words`}
                  className="relative h-0.5 flex-1 overflow-hidden bg-muted lg:h-1.5 lg:rounded-full"
                >
                  <motion.div
                    className="absolute inset-0 origin-left rounded-full bg-primary"
                    initial={false}
                    animate={{ scaleX: progress }}
                    transition={{ duration: 0.4, ease: EASE_OUT }}
                  />
                </div>
                <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums lg:inline">
                  {totalAnswers}/{totalHidden} words
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <TransportButton
                    label="Replay this line (Alt+R)"
                    onClick={controller.replayLine}
                    disabled={!controller.isReady}
                    highlight={isPausedForRetry}
                  >
                    <Repeat aria-hidden className="size-4" />
                    <span className="hidden text-sm sm:inline">Replay</span>
                  </TransportButton>
                  {/* The 10s jump is dropped on narrow phones: replay-line and 5s cover it, and the row has to fit 4 controls. */}
                  <TransportButton
                    label="Rewind 10 seconds"
                    onClick={() => rewind(10)}
                    disabled={!controller.isReady}
                    className={keyboardOpen ? "hidden" : "hidden sm:flex"}
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    <span className="text-xs tabular-nums">10</span>
                  </TransportButton>
                  <TransportButton
                    label="Rewind 5 seconds (Alt+B)"
                    onClick={() => rewind(5)}
                    disabled={!controller.isReady}
                    className={keyboardOpen ? "hidden" : undefined}
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    <span className="text-xs tabular-nums">5</span>
                  </TransportButton>
                </div>

                <motion.button
                  type="button"
                  onClick={togglePlayback}
                  disabled={!controller.isReady || (isPausedForRetry && !isPlaying)}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  whileTap={{ scale: 0.92 }}
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-shadow duration-300 disabled:opacity-40 disabled:shadow-none",
                    keyboardOpen && "size-10",
                    !isPlaying && controller.isReady && !isPausedForRetry && "shadow-[0_0_28px_-6px_var(--glow-primary)]",
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isPlaying ? "pause" : "play"}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex"
                    >
                      {isPlaying ? (
                        <Pause aria-hidden className="size-5" fill="currentColor" />
                      ) : (
                        <Play aria-hidden className="ml-0.5 size-5" fill="currentColor" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>

                <div className="flex items-center gap-1.5">
                  {!keyboardOpen && (
                    <>
                      <PlaybackRateControl
                        rate={playbackRate}
                        onChange={controller.setPlaybackRate}
                        disabled={!controller.isReady}
                      />
                      <SyncControl
                        compact
                        offset={controller.syncOffset}
                        onChange={controller.setSyncOffset}
                        onTap={controller.syncToCurrentLine}
                        disabled={!controller.isReady}
                      />
                    </>
                  )}
                  <TransportButton label="Skip line (Alt+S)" onClick={controller.skipLine} disabled={!controller.isReady}>
                    <SkipForward aria-hidden className="size-4" />
                    <span className="hidden text-sm sm:inline">Skip</span>
                  </TransportButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * With the keyboard up, a tap on a button must not take focus away from the
 * blank: the phone would close the keyboard, and the player wants to replay
 * the line and keep typing. Fields still take focus as usual.
 */
function keepTypingFocus(event: React.MouseEvent) {
  if (!isTextField(event.target as Element)) event.preventDefault();
}

/** Score and combo, with the "+points" / "miss" flash that rises from them. */
function GameHud({
  score,
  combo,
  flash,
  onFlashDone,
}: {
  score: number;
  combo: number;
  flash: ScoreFlash | null;
  onFlashDone: (id: number) => void;
}) {
  return (
    <div className="relative flex shrink-0 items-center gap-2">
      <HudStat icon={<Star className="size-3.5" />} label="Score" value={score} tone="primary" />
      <ComboStat combo={combo} />
      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash.id}
            aria-hidden
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1, 0], y: [4, -6, -14, -22], scale: 1 }}
            transition={{ duration: 0.9, ease: EASE_OUT, times: [0, 0.15, 0.6, 1] }}
            onAnimationComplete={() => onFlashDone(flash.id)}
            className={cn(
              "pointer-events-none absolute -top-3 left-3 font-display text-sm font-bold tabular-nums",
              flash.tone === "hit" ? "text-secondary" : "text-destructive",
            )}
          >
            {flash.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  disabled,
  highlight = false,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Draws the eye to the button that gets the song going again. */
  highlight?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border px-3 font-medium transition-[transform,color,background-color] duration-150 disabled:opacity-40 enabled:active:scale-95",
        highlight
          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_22px_-6px_var(--glow-primary)] motion-safe:animate-pulse"
          : "border-border bg-accent/60 text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Tips and the keyboard shortcuts, tucked behind a button so they don't take room from the game. */
function GameHelp() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Tips and keyboard shortcuts"
        title="Tips and keyboard shortcuts"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <CircleHelp aria-hidden className="size-5" />
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="mb-1.5 text-sm font-semibold">Tips</p>
        <p className="text-sm text-muted-foreground lg:hidden">
          Tap any word for its definition · tap a line to jump there · swipe the current line to skip a word
        </p>
        <p className="hidden text-sm text-muted-foreground lg:block">
          Click any word for its definition · click a line to jump there
        </p>
        {/* Phones have no hardware keys to press. */}
        <div className="mt-3 hidden lg:block">
          <p className="mb-1.5 text-sm font-semibold">Keyboard</p>
          <ShortcutLegend />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ShortcutLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {GAME_SHORTCUT_LEGEND.map(({ keys, label }) => (
        <span key={keys} className="flex items-center gap-1.5">
          <kbd className="rounded border border-border bg-accent/60 px-1.5 py-0.5 font-body text-xs font-medium text-foreground/80">
            {keys}
          </kbd>
          {label}
        </span>
      ))}
    </p>
  );
}

function ComboStat({ combo }: { combo: number }) {
  const isHot = combo >= HOT_COMBO;
  return (
    <div
      className={cn(
        "glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-secondary transition-shadow duration-300",
        isHot && "shadow-[0_0_22px_-4px_var(--glow-secondary)]",
      )}
    >
      <motion.span
        aria-hidden
        className="flex"
        animate={isHot ? { scale: [1, 1.25, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
        transition={isHot ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.4 } : { duration: 0.2 }}
      >
        <Flame className="size-3.5" fill={isHot ? "currentColor" : "none"} />
      </motion.span>
      <span className="sr-only">Combo:</span>
      <AnimatedNumber value={combo} prefix={combo > 0 ? "×" : ""} />
    </div>
  );
}

function HudStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "secondary";
}) {
  return (
    <div
      className={cn(
        "glass flex items-center gap-1.5 rounded-full px-3 py-1.5",
        tone === "primary" ? "text-primary" : "text-secondary",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="sr-only">{label}:</span>
      <AnimatedNumber value={value} />
    </div>
  );
}

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="tabular-nums text-sm font-semibold"
      >
        {prefix}
        {value}
      </motion.span>
    </AnimatePresence>
  );
}
