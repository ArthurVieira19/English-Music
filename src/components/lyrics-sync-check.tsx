"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Hand, ListRestart, Play, RotateCcw, Undo2, Wand2, X } from "lucide-react";
import type { LyricLine } from "@/types/LyricLine";
import { YouTubePlayer } from "@/modules/player/youtubePlayer";
import { SYNC_NUDGES, clampOffset, offsetFromTap } from "@/modules/game/syncOffset";
import { addTap, retimeLyrics } from "@/modules/lyrics/retimeLyrics";
import { cn } from "@/lib/utils";

const YT_PLAYING = 1;
/** YouTube may not know a video's length until it starts; keep asking for this long. */
const DURATION_POLL_MS = 500;
const DURATION_POLL_ATTEMPTS = 20;
/** A nudge replays from this long before the current line, so the change can be heard landing. */
const PREVIEW_LEAD_SECONDS = 1.5;

/** Index of the line being sung at `lyricTime`, -1 before the first line. */
export function lineAt(lines: LyricLine[], lyricTime: number): number {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i].start <= lyricTime; i++) index = i;
  return index;
}

function formatStep(step: number): string {
  return `${step > 0 ? "+" : "−"}${Math.abs(step)}s`;
}

/** "Lyrics as timed", "Lyrics start 23.4s later", "Lyrics start 1.2s earlier". */
export function describeShift(offset: number): string {
  if (offset === 0) return "Lyrics as timed";
  const amount = `${Number(Math.abs(offset).toFixed(2))}s`;
  return offset > 0 ? `Lyrics start ${amount} later` : `Lyrics start ${amount} earlier`;
}

const buttonBase =
  "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-[transform,background-color] active:scale-95 disabled:opacity-40";
const secondaryButton = cn(buttonBase, "border border-border bg-accent/60 hover:bg-accent");
const primaryButton = cn(buttonBase, "bg-primary px-4 font-semibold text-primary-foreground hover:scale-[1.02]");

/**
 * Plays the video with the chosen lyrics running over it, so whoever adds a
 * song can see and hear whether they line up before every player has to.
 *
 * Two tools, for two kinds of problem:
 *  - Adjust: the whole song is early or late by the same amount (a longer
 *    intro). One tap on the first line, then nudges; each nudge replays the
 *    current line so the result can be heard.
 *  - Retime: lines are each off by a different amount. Play along and tap the
 *    start of every line.
 * Either way the result is saved into the song itself.
 *
 * Also reports the video's length, which the lyrics search uses to prefer a
 * version timed for this exact cut.
 */
export function LyricsSyncCheck({
  youtubeId,
  lines,
  offset,
  onOffsetChange,
  onRetime,
  onDuration,
  suggestedOffset,
}: {
  youtubeId: string;
  lines: LyricLine[];
  /** Seconds the lyrics are moved later (negative: earlier). */
  offset: number;
  onOffsetChange: (seconds: number) => void;
  /** New timing for every line, in video time (the offset no longer applies to it). */
  onRetime: (lines: LyricLine[]) => void;
  onDuration: (seconds: number) => void;
  /** A likely correction worth offering as one click (e.g. the video's extra intro), or null. */
  suggestedOffset: number | null;
}) {
  const elementId = `sync-check-${youtubeId}`;
  const playerRef = useRef<YouTubePlayer | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLine, setCurrentLine] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<"adjust" | "retime">("adjust");
  const [taps, setTaps] = useState<number[]>([]);

  // Latest values for callbacks that outlive a render (the player and the frame loop).
  const live = useRef({ lines, offset, onDuration });
  useEffect(() => {
    live.current = { lines, offset, onDuration };
  });

  useEffect(() => {
    let reported = false;
    let polls = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const reportDuration = () => {
      const seconds = player.getDuration();
      if (reported || seconds <= 0) return seconds > 0;
      reported = true;
      live.current.onDuration(seconds);
      return true;
    };
    const poll = () => {
      if (reportDuration() || ++polls >= DURATION_POLL_ATTEMPTS) return;
      pollTimer = setTimeout(poll, DURATION_POLL_MS);
    };

    const player = new YouTubePlayer({
      elementId,
      videoId: youtubeId,
      onReady: poll,
      onStateChange: (state) => {
        setIsPlaying(state === YT_PLAYING);
        if (state === YT_PLAYING) reportDuration();
      },
    });
    playerRef.current = player;

    let frame = 0;
    const tick = () => {
      const { lines: currentLines, offset: currentOffset } = live.current;
      const lyricTime = player.getCurrentTime() - currentOffset;
      const index = lineAt(currentLines, lyricTime);
      setCurrentLine((previous) => (previous === index ? previous : index));

      // How far through the current line we are, drawn straight onto the bar
      // so the frame loop doesn't re-render the component 60 times a second.
      const line = currentLines[index];
      if (progressRef.current) {
        const share = line && line.end > line.start ? (lyricTime - line.start) / (line.end - line.start) : 0;
        progressRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, share))})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(pollTimer);
      player.destroy();
      playerRef.current = null;
    };
  }, [youtubeId, elementId]);

  function playFrom(videoSeconds: number) {
    playerRef.current?.seek(Math.max(0, videoSeconds));
    playerRef.current?.play();
  }

  // ---- Adjust mode -------------------------------------------------------

  function tapFirstLine() {
    const player = playerRef.current;
    const first = lines[0];
    if (!player || !first) return;
    if (!isPlaying) {
      setHint("Press “Play from the start” first, then tap the moment the first line is sung.");
      return;
    }
    setHint(null);
    onOffsetChange(offsetFromTap({ rawTime: player.getCurrentTime(), lineStart: first.start }));
  }

  /** Moves the lyrics and replays the line on screen, so the new timing can be heard straight away. */
  function nudge(step: number) {
    const next = clampOffset(offset + step);
    onOffsetChange(next);
    setHint(null);

    const player = playerRef.current;
    if (!player || lines.length === 0) return;
    const index = Math.max(0, lineAt(lines, player.getCurrentTime() - offset));
    playFrom(lines[index].start + next - PREVIEW_LEAD_SECONDS);
  }

  // ---- Retime mode -------------------------------------------------------

  function startRetime() {
    setMode("retime");
    setTaps([]);
    setHint(null);
    playFrom(0);
  }

  function tapLine() {
    const player = playerRef.current;
    if (!player) return;
    if (!isPlaying) {
      setHint("The video is paused. Press play, then tap as each line starts.");
      return;
    }
    setHint(null);
    const next = addTap(taps, player.getCurrentTime());
    if (next === taps) return;
    if (next.length >= lines.length) {
      finishRetime(next);
      return;
    }
    setTaps(next);
  }

  /** Takes back the last tap and rewinds a little before it, to try that line again. */
  function undoTap() {
    if (taps.length === 0) return;
    const remaining = taps.slice(0, -1);
    setTaps(remaining);
    playFrom((remaining[remaining.length - 1] ?? 0) - 1);
  }

  function finishRetime(finalTaps = taps) {
    if (finalTaps.length > 0) onRetime(retimeLyrics(lines, finalTaps));
    setMode("adjust");
    setTaps([]);
    setHint(null);
  }

  function cancelRetime() {
    setMode("adjust");
    setTaps([]);
    setHint(null);
  }

  const shown = [currentLine - 1, currentLine, currentLine + 1];
  const nextToTap = lines[taps.length];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{mode === "adjust" ? "Check the timing" : "Retime line by line"}</p>

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        <div id={elementId} className="absolute inset-0" />
      </div>

      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">Pick or paste lyrics to check how they line up with the video.</p>
      ) : mode === "adjust" ? (
        <>
          <div className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-md bg-accent/40 px-3 py-3 text-center">
            {shown.map((index, position) => (
              <div key={position} className={cn("flex w-full flex-col items-center", position === 1 && "gap-1.5")}>
                <p
                  className={cn(
                    "min-h-5",
                    position === 1 ? "font-display text-lg font-semibold text-foreground" : "text-sm text-muted-foreground/70",
                  )}
                >
                  {index >= 0 && index < lines.length ? lines[index].text : position === 1 ? "♪" : ""}
                </p>
                {position === 1 && (
                  <div aria-hidden className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                    <div ref={progressRef} className="h-full origin-left rounded-full bg-primary" style={{ transform: "scaleX(0)" }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => playFrom(0)} className={secondaryButton}>
              <Play aria-hidden className="size-3.5" /> Play from the start
            </button>
            <button type="button" onClick={tapFirstLine} className={primaryButton}>
              <Hand aria-hidden className="size-3.5" /> Tap when the first line starts
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            First line: <span className="text-foreground">&ldquo;{lines[0].text}&rdquo;</span>
          </p>
          {hint && (
            <p role="status" className="text-xs text-muted-foreground">
              {hint}
            </p>
          )}

          {suggestedOffset !== null && offset === 0 && (
            <button
              type="button"
              onClick={() => nudge(clampOffset(suggestedOffset))}
              className="flex items-center gap-1.5 self-start text-xs text-primary hover:underline"
            >
              <Wand2 aria-hidden className="size-3.5" />
              The video is {Math.abs(Math.round(suggestedOffset))}s longer: try starting the lyrics that much later
            </button>
          )}

          <div className="flex flex-col gap-1.5 rounded-md border border-border/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={offset}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  aria-live="polite"
                  className="text-sm font-semibold tabular-nums"
                >
                  {describeShift(offset)}
                </motion.p>
              </AnimatePresence>
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => nudge(-offset)}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw aria-hidden className="size-3" /> Reset
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {SYNC_NUDGES.map((step) => (
                <button
                  key={step}
                  type="button"
                  aria-label={step > 0 ? `Lyrics ${Math.abs(step)} seconds later` : `Lyrics ${Math.abs(step)} seconds earlier`}
                  onClick={() => nudge(step)}
                  className="h-8 rounded-md border border-border bg-accent/60 px-2.5 text-xs font-medium tabular-nums hover:bg-accent active:scale-95"
                >
                  {formatStep(step)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Lyrics ahead of the singer? Make them later. Each nudge replays the current line so you can hear it land.
            </p>
          </div>

          <button type="button" onClick={startRetime} className={cn(secondaryButton, "self-start")}>
            <ListRestart aria-hidden className="size-3.5" /> Lines drift apart? Retime line by line
          </button>
          <p className="text-xs text-muted-foreground">
            Whatever you set here is saved into the song, so every player gets lyrics that match this video.
          </p>
        </>
      ) : (
        <>
          <div className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-md bg-accent/40 px-3 py-3 text-center">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Line {Math.min(taps.length + 1, lines.length)} of {lines.length}
            </p>
            <p className="min-h-5 text-sm text-muted-foreground/70">{taps.length > 0 ? lines[taps.length - 1].text : ""}</p>
            <p className="font-display text-lg font-semibold text-foreground">{nextToTap?.text}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={tapLine}
              autoFocus
              className={cn(primaryButton, "h-11 px-5 text-base")}
            >
              <Hand aria-hidden className="size-4" /> This line starts now
            </button>
            <button type="button" onClick={undoTap} disabled={taps.length === 0} className={secondaryButton}>
              <Undo2 aria-hidden className="size-3.5" /> Undo
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tap the big button (or press Space while it&apos;s focused) the moment the highlighted line starts. Stop
            whenever you like: lines you didn&apos;t reach follow along with the last one you tapped.
          </p>
          {hint && (
            <p role="status" className="text-xs text-muted-foreground">
              {hint}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => finishRetime()} disabled={taps.length === 0} className={secondaryButton}>
              <Check aria-hidden className="size-3.5" /> Use this timing
            </button>
            <button type="button" onClick={() => startRetime()} className={secondaryButton}>
              <Play aria-hidden className="size-3.5" /> Start over
            </button>
            <button type="button" onClick={cancelRetime} className={cn(secondaryButton, "border-transparent bg-transparent")}>
              <X aria-hidden className="size-3.5" /> Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
