"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Music2, Play, Trash2 } from "lucide-react";
import type { Song } from "@/types/Song";
import { useStatsStore } from "@/stores/statsStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

/**
 * Text color per difficulty, shared by the meter and anywhere a difficulty is
 * named. Runs like ski pistes (light blue, blue, red, black) using the
 * --tier-* tokens, which clear 4.5:1 as small text in both themes.
 */
export const DIFFICULTY_TEXT: Record<string, string> = {
  beginner: "text-tier-1",
  intermediate: "text-tier-2",
  advanced: "text-tier-3",
  expert: "text-tier-4",
};

export function songHref(song: Pick<Song, "id">): string {
  return `/game?id=${encodeURIComponent(song.id)}`;
}

/**
 * Difficulty as a 4-step meter plus its name: the bars read at a glance in a
 * dense grid, the word keeps it unambiguous (and readable without color).
 */
export function DifficultyMeter({
  difficulty,
  label,
  className,
}: {
  difficulty: string;
  /** Text next to the bars; defaults to the difficulty itself (e.g. "Intermediate 2" for a level). */
  label?: string;
  className?: string;
}) {
  const level = Math.max(0, DIFFICULTY_LEVELS.indexOf(difficulty as (typeof DIFFICULTY_LEVELS)[number]));
  const tone = DIFFICULTY_TEXT[difficulty] ?? DIFFICULTY_TEXT.beginner;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium capitalize", tone, className)}>
      <span aria-hidden className="flex items-end gap-[2px]">
        {DIFFICULTY_LEVELS.map((name, i) => (
          <span
            key={name}
            className={cn("w-[3px] rounded-full bg-current", i > level && "opacity-25")}
            style={{ height: `${6 + i * 2}px` }}
          />
        ))}
      </span>
      {label ?? difficulty}
    </span>
  );
}

/** YouTube always has `default.jpg`; higher-res thumbnails don't exist for every video. */
const THUMBNAIL_FALLBACKS = ["mqdefault", "default"] as const;

export function SongThumbnail({
  song,
  className,
  highRes = false,
}: {
  song: Song;
  className?: string;
  /** Try YouTube's 1280px frame first: sharper for big heroes, and 16:9 without the black bars hqdefault bakes in. */
  highRes?: boolean;
}) {
  // Attempt -1 is the high-res frame (not every video has one), 0 the song's
  // own thumbnail, then the YouTube fallbacks.
  const [attempt, setAttempt] = useState(highRes ? -1 : song.thumbnail ? 0 : 1);
  const exhausted = attempt > THUMBNAIL_FALLBACKS.length;
  const nextSource = () => setAttempt((a) => (a === -1 && !song.thumbnail ? 1 : a + 1));

  const src =
    attempt === -1
      ? `https://i.ytimg.com/vi/${song.youtubeId}/maxresdefault.jpg`
      : attempt === 0
        ? song.thumbnail
        : `https://i.ytimg.com/vi/${song.youtubeId}/${THUMBNAIL_FALLBACKS[attempt - 1]}.jpg`;

  return (
    <div className={cn("relative aspect-video overflow-hidden bg-gradient-to-br from-primary/25 via-muted to-secondary/15", className)}>
      {exhausted ? (
        <div className="flex size-full items-center justify-center text-primary/70" aria-hidden>
          <Music2 className="size-8" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={nextSource}
          // A missing maxresdefault can still "load" as YouTube's 120x90 grey placeholder.
          onLoad={(e) => attempt === -1 && e.currentTarget.naturalWidth <= 120 && nextSource()}
          className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]"
        />
      )}
    </div>
  );
}

/**
 * Art-first tile: the thumbnail carries the card, title and artist sit
 * underneath on the page itself (no box around them), and the play button
 * rises into the art's corner on hover — the one red thing in the grid.
 */
export function SongCard({
  song,
  index = 0,
  onDelete,
  className,
}: {
  song: Song;
  index?: number;
  onDelete?: (songId: string) => void;
  className?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isCompleted = useStatsStore((s) => s.progress.completedSongIds.includes(song.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 8) * 0.03 }}
      className={cn("group relative", className)}
    >
      <Link
        href={songHref(song)}
        className="-m-2 block rounded-xl p-2 transition-colors duration-200 hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <div className="relative overflow-hidden rounded-lg ring-1 ring-foreground/[0.06]">
          <SongThumbnail song={song} />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="absolute right-2 bottom-2 flex size-10 translate-y-2 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-[0_4px_8px_-2px_oklch(0_0_0/45%)] transition-[opacity,transform] duration-200 ease-[var(--ease-out-quint)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
          >
            <Play className="ml-0.5 size-4" fill="currentColor" />
          </span>
          {isCompleted && (
            <span
              title="Completed"
              className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/65 py-0.5 pr-2 pl-1 text-[0.68rem] font-semibold text-white backdrop-blur-sm"
            >
              <Check aria-hidden className="size-3" strokeWidth={3} />
              Played
            </span>
          )}
        </div>
        <div className="mt-2.5 min-w-0 px-0.5">
          <h3 className="truncate text-sm font-semibold sm:text-[0.95rem]">{song.title}</h3>
          <p className="truncate text-sm text-muted-foreground">{song.artist}</p>
          <DifficultyMeter difficulty={song.difficulty} className="mt-1.5" />
        </div>
      </Link>

      {onDelete && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          {/* Sibling of the Link (not nested in it), so it stays a real,
              separately focusable control. Always visible on touch screens;
              revealed on hover/focus where a pointer can hover. */}
          <DialogTrigger
            render={<button type="button" />}
            aria-label={`Remove ${song.title} from library`}
            className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-destructive focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          >
            <Trash2 aria-hidden className="size-3.5" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove &ldquo;{song.title}&rdquo;?</DialogTitle>
              <DialogDescription>
                This removes it from the library for every player. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(song.id);
                  setConfirmOpen(false);
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </motion.div>
  );
}
