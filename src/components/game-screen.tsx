"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Pause, Play, Repeat, RotateCcw, SkipForward, Star } from "lucide-react";
import type { Song } from "@/types/Song";
import type { GameMode } from "@/types/GameMode";
import { useGameController } from "@/hooks/useGameController";
import { useGameShortcuts } from "@/hooks/useGameShortcuts";
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

  return (
    // Extra bottom clearance on phones: the fixed transport bar is taller than the tab bar that main's padding accounts for.
    <div className="relative isolate mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-4 pb-10 lg:gap-5 lg:py-8">
      <AmbientArt song={song} className="lg:-top-8" />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SongThumbnail song={song} className="hidden w-20 shrink-0 rounded-md ring-1 ring-foreground/10 sm:block" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-semibold lg:text-xl">{song.title}</h1>
            <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
              <span className="truncate">{song.artist}</span>
              <span aria-hidden className="hidden sm:inline">·</span>
              <DifficultyMeter difficulty={level.difficulty} label={levelLabel(level)} className="hidden sm:inline-flex" />
            </p>
          </div>
        </div>

        <div className="relative flex shrink-0 gap-2">
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
                onAnimationComplete={() => setFlash((current) => (current?.id === flash.id ? null : current))}
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
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-shadow duration-500",
              isPlaying && "shadow-[0_0_0_1px_var(--glow-primary)]",
            )}
          >
            <div className="yt-frame relative aspect-video w-full overflow-hidden bg-black">
              <div id={elementId} className="absolute inset-0" />
              {!controller.isReady && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-card" aria-hidden />
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <SyncControl
              offset={controller.syncOffset}
              onChange={controller.setSyncOffset}
              onTap={controller.syncToCurrentLine}
              disabled={!controller.isReady}
            />
          </div>

          <AnimatePresence initial={false}>
            {isPausedForRetry && (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
              >
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Paused.</span> Didn&apos;t catch it? Take your time.
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

          <AnimatePresence initial={false}>
            {note && <MistakeNote key={note.id} note={note} onDismiss={dismissNote} />}
          </AnimatePresence>

          {mode === "multipleChoice" && activeLine && hasPendingChoice && (
            <div className="glass rounded-2xl p-3 sm:p-4">
              <ExerciseChoicesView
                line={activeLine}
                exerciseIndex={activeExerciseIndex}
                answeredTokens={answeredTokens}
                wrongGuesses={wrongGuesses}
                onSubmit={handleSubmit}
              />
            </div>
          )}

          {mode === "wordBank" && activeLine?.mode === "wordBank" && (
            <div className="glass rounded-2xl p-3 sm:p-4">
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

          {/* Desktop: the space under the video holds the cheat sheet, so the lyrics column stays only lyrics. */}
          <div className="hidden flex-col gap-3 rounded-xl border border-border px-4 py-3.5 lg:flex">
            <p className="text-sm text-muted-foreground">
              Tap any word for its definition · tap a line to jump there
            </p>
            <ShortcutLegend />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <LyricsPanel
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
          {exercises.length > 0 && (
            <p className="px-2 text-xs text-muted-foreground lg:hidden">
              Tap any word for its definition · tap a line to jump there · swipe the current line to skip a word
            </p>
          )}
        </div>
      </div>

      {/* Fixed to the bottom edge on phones (thumb reach, stays visible while
          the lyrics scroll); an ordinary inline bar from lg up. */}
      <div className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 px-4 pt-2.5 lg:static lg:z-auto lg:rounded-2xl lg:border lg:px-4 lg:py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Song completion"
              aria-valuemin={0}
              aria-valuemax={totalHidden}
              aria-valuenow={totalAnswers}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <motion.div
                className="absolute inset-0 origin-left rounded-full bg-primary"
                initial={false}
                animate={{ scaleX: progress }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {totalAnswers}/{totalHidden} words
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <TransportButton
                label="Replay this line (Alt+R)"
                onClick={controller.replayLine}
                disabled={!controller.isReady}
              >
                <Repeat aria-hidden className="size-4" />
                <span className="hidden text-sm sm:inline">Replay</span>
              </TransportButton>
              {/* The 10s jump is dropped on narrow phones: replay-line and 5s cover it, and the row has to fit 4 controls. */}
              <TransportButton
                label="Rewind 10 seconds"
                onClick={() => rewind(10)}
                disabled={!controller.isReady}
                className="hidden sm:flex"
              >
                <RotateCcw aria-hidden className="size-4" />
                <span className="text-xs tabular-nums">10</span>
              </TransportButton>
              <TransportButton
                label="Rewind 5 seconds (Alt+B)"
                onClick={() => rewind(5)}
                disabled={!controller.isReady}
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
              <PlaybackRateControl
                rate={playbackRate}
                onChange={controller.setPlaybackRate}
                disabled={!controller.isReady}
              />
              <TransportButton label="Skip line (Alt+S)" onClick={controller.skipLine} disabled={!controller.isReady}>
                <SkipForward aria-hidden className="size-4" />
                <span className="hidden text-sm sm:inline">Skip</span>
              </TransportButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
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
        "flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border border-border bg-accent/60 px-3 font-medium text-muted-foreground transition-[transform,color,background-color] duration-150 disabled:opacity-40 enabled:hover:bg-accent enabled:hover:text-foreground enabled:active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Keyboard shortcut cheat-sheet — desktop only, since phones have no hardware keys to press. */
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
