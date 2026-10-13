"use client";

import { useEffect, useRef, useState } from "react";
import { Hand, Play, RotateCcw, Wand2 } from "lucide-react";
import type { LyricLine } from "@/types/LyricLine";
import { YouTubePlayer } from "@/modules/player/youtubePlayer";
import { SYNC_NUDGES, clampOffset, describeOffset, offsetFromTap } from "@/modules/game/syncOffset";
import { cn } from "@/lib/utils";

const YT_PLAYING = 1;
/** YouTube may not know a video's length until it starts; keep asking for this long. */
const DURATION_POLL_MS = 500;
const DURATION_POLL_ATTEMPTS = 20;

/** Index of the line being sung at `lyricTime`, -1 before the first line. */
function lineAt(lines: LyricLine[], lyricTime: number): number {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i].start <= lyricTime; i++) index = i;
  return index;
}

function formatStep(step: number): string {
  return `${step > 0 ? "+" : "−"}${Math.abs(step)}s`;
}

/**
 * Plays the video with the chosen lyrics running over it, so whoever adds a
 * song can see whether they line up before every player has to. One tap at
 * the moment the singing starts lines them up; nudges fine-tune. The
 * correction is baked into the song's timestamps when it's saved.
 *
 * Also reports the video's length, which the lyrics search uses to prefer a
 * version timed for this exact cut.
 */
export function LyricsSyncCheck({
  youtubeId,
  lines,
  offset,
  onOffsetChange,
  onDuration,
  suggestedOffset,
}: {
  youtubeId: string;
  lines: LyricLine[];
  /** Seconds the lyrics are moved later (negative: earlier). */
  offset: number;
  onOffsetChange: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  /** A likely correction worth offering as one click (e.g. the video's extra intro), or null. */
  suggestedOffset: number | null;
}) {
  const elementId = `sync-check-${youtubeId}`;
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLine, setCurrentLine] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);

  // Latest values for callbacks that outlive a render (the player and the frame loop).
  const live = useRef({ lines, offset, onDuration });
  live.current = { lines, offset, onDuration };

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
      const index = lineAt(currentLines, player.getCurrentTime() - currentOffset);
      setCurrentLine((previous) => (previous === index ? previous : index));
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

  function playFromStart() {
    setHint(null);
    playerRef.current?.seek(0);
    playerRef.current?.play();
  }

  function tapSingingStarts() {
    const player = playerRef.current;
    const first = lines[0];
    if (!player || !first) return;
    if (!isPlaying) {
      setHint("Press play first, then tap the moment the first line is sung.");
      return;
    }
    setHint(null);
    onOffsetChange(offsetFromTap({ rawTime: player.getCurrentTime(), lineStart: first.start }));
  }

  const shown = [currentLine - 1, currentLine, currentLine + 1];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Check the timing</p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {describeOffset(offset)}
        </p>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        <div id={elementId} className="absolute inset-0" />
      </div>

      {lines.length > 0 ? (
        <>
          <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-md bg-accent/40 px-3 py-3 text-center">
            {shown.map((index, position) => (
              <p
                key={position}
                className={cn(
                  "min-h-5 transition-colors",
                  position === 1 ? "font-display text-lg font-semibold text-foreground" : "text-sm text-muted-foreground/70",
                )}
              >
                {index >= 0 && index < lines.length ? lines[index].text : position === 1 ? "♪" : ""}
              </p>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={playFromStart}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-accent/60 px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Play aria-hidden className="size-3.5" /> Play from the start
            </button>
            <button
              type="button"
              onClick={tapSingingStarts}
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95"
            >
              <Hand aria-hidden className="size-3.5" /> Tap when the singing starts
            </button>
          </div>
          {hint && (
            <p role="status" className="text-xs text-muted-foreground">
              {hint}
            </p>
          )}

          {suggestedOffset !== null && offset === 0 && (
            <button
              type="button"
              onClick={() => onOffsetChange(clampOffset(suggestedOffset))}
              className="flex items-center gap-1.5 self-start text-xs text-primary hover:underline"
            >
              <Wand2 aria-hidden className="size-3.5" />
              The video is {Math.abs(Math.round(suggestedOffset))}s longer: try starting the lyrics that much later
            </button>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Fine-tune:</span>
            {SYNC_NUDGES.map((step) => (
              <button
                key={step}
                type="button"
                aria-label={step > 0 ? `Lyrics ${Math.abs(step)} seconds later` : `Lyrics ${Math.abs(step)} seconds earlier`}
                onClick={() => onOffsetChange(clampOffset(offset + step))}
                className="h-8 rounded-md border border-border bg-accent/60 px-2.5 text-xs font-medium tabular-nums hover:bg-accent"
              >
                {formatStep(step)}
              </button>
            ))}
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => onOffsetChange(0)}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw aria-hidden className="size-3" /> Reset
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Whatever you set here is saved into the song, so every player gets lyrics that match this video.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Pick or paste lyrics to check how they line up with the video.</p>
      )}
    </div>
  );
}
