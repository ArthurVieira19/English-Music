"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpenCheck, CircleCheck, Flame, Loader2, Music2, Play, Sparkles } from "lucide-react";
import type { Song } from "@/types/Song";
import { SONGS } from "@/data/songs";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useReviewStore } from "@/stores/reviewStore";
import { useStatsStore } from "@/stores/statsStore";
import { XP_PER_LEVEL } from "@/modules/stats/xpEngine";
import { startOfDay } from "@/modules/stats/statsCalculator";
import { getDailyPick, getNotPlayedYet, getRecentlyPlayed } from "@/modules/library/songPicks";
import { AmbientArt } from "@/components/ambient-art";
import { DifficultyMeter, SongCard, SongThumbnail, songHref } from "@/components/song-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function greeting(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Everyone who reaches this page is signed in, so instead of pitching the app
 * it answers "what should I play now?": today's pick up top, where the streak
 * stands next to it, then the songs to jump back into.
 */
export function HomeDashboard() {
  const displayName = useAuthStore((s) => s.displayName);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const librarySongs = useLibraryStore((s) => s.songs);
  const libraryStatus = useLibraryStore((s) => s.status);
  const history = useStatsStore((s) => s.statistics.history);
  const progress = useStatsStore((s) => s.progress);
  const dueCount = useReviewStore((s) => s.weakWords.filter((w) => w.nextReviewAt <= Date.now()).length);

  const allSongs = useMemo(() => [...SONGS, ...librarySongs], [librarySongs]);
  const dailyPick = useMemo(() => getDailyPick(allSongs), [allSongs]);
  const recent = useMemo(() => getRecentlyPlayed(history, allSongs), [history, allSongs]);
  const fresh = useMemo(
    () => getNotPlayedYet(allSongs, progress.completedSongIds).filter((song) => song.id !== dailyPick?.id),
    [allSongs, progress.completedSongIds, dailyPick],
  );

  const firstName = (displayName ?? "").split(" ")[0];
  const isNewPlayer = history.length === 0 && progress.xp === 0;

  return (
    <div className="relative isolate mx-auto max-w-6xl px-4 pt-8 pb-12 md:pt-12">
      {dailyPick && <AmbientArt song={dailyPick} className="md:-top-12" />}

      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {greeting(new Date().getHours())}
          {firstName && `, ${firstName}`}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {dueCount > 0
            ? `${dueCount} ${dueCount === 1 ? "word is" : "words are"} waiting for review — and there's a new pick today.`
            : progress.streak > 0
              ? `You're on a ${progress.streak}-day streak. One song keeps it going.`
              : "Pick a song, press play, and catch every word."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-5">
        {dailyPick ? (
          <DailyPickHero song={dailyPick} />
        ) : (
          <EmptyHero loading={libraryStatus === "idle" || libraryStatus === "loading"} isAdmin={isAdmin} />
        )}
        <ProgressPanel
          streak={progress.streak}
          activityDays={progress.activityDays}
          xp={progress.xp}
          level={progress.level}
          dueCount={dueCount}
        />
      </div>

      {isNewPlayer && (
        <Link
          href="/how-to-play"
          className="group mt-4 flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm transition-colors duration-200 hover:bg-foreground/[0.04]"
        >
          <span>
            <span className="font-semibold">First time here?</span>{" "}
            <span className="text-muted-foreground">See how a round works in under a minute.</span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      )}

      {recent.length > 0 && <Shelf title="Jump back in" songs={recent} />}
      {fresh.length > 0 && <Shelf title="Fresh for you" songs={fresh} />}
    </div>
  );
}

function DailyPickHero({ song }: { song: Song }) {
  return (
    <motion.section
      aria-label="Today's pick"
      className="min-w-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <Link
        href={songHref(song)}
        className="group relative flex aspect-[4/3] min-w-0 flex-col justify-end overflow-hidden rounded-2xl ring-1 ring-foreground/[0.08] sm:aspect-[16/8] lg:aspect-auto lg:h-full lg:min-h-80"
      >
        <SongThumbnail song={song} highRes className="absolute inset-0 aspect-auto size-full" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[oklch(0.2_0.075_270/0.94)] via-[oklch(0.22_0.075_270/0.45)] to-transparent"
        />
        {/* `dark` scopes the dark-theme tokens to the text over the photo, so the
            difficulty color and the red play button read on navy in both themes. */}
        <div className="dark relative flex items-end justify-between gap-4 p-5 sm:p-7">
          <div className="min-w-0 text-white">
            <p className="flex items-center gap-1.5 text-sm font-medium text-white/80">
              <Sparkles aria-hidden className="size-4 text-primary" />
              Today&apos;s pick
            </p>
            <h2 className="mt-1.5 font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              {song.title}
            </h2>
            <p className="mt-1 truncate text-white/75">{song.artist}</p>
            <DifficultyMeter difficulty={song.difficulty} className="mt-3 rounded-full bg-[oklch(0.2_0.075_270/0.6)] px-2.5 py-1 backdrop-blur-sm" />
          </div>
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_8px_-2px_oklch(0.1_0.05_270/60%)] transition-transform duration-200 ease-[var(--ease-out-quint)] group-hover:scale-105 group-active:scale-95 sm:size-16"
          >
            <Play className="ml-1 size-6" fill="currentColor" />
          </span>
        </div>
        <span className="sr-only">Play {song.title}</span>
      </Link>
    </motion.section>
  );
}

function EmptyHero({ loading, isAdmin }: { loading: boolean; isAdmin: boolean }) {
  return (
    <section className="glass flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center lg:min-h-80">
      {loading ? (
        <Loader2 aria-label="Loading songs" className="size-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <Music2 aria-hidden className="size-8 text-primary" />
          <h2 className="font-display text-xl font-semibold">No songs yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground text-pretty">
            {isAdmin
              ? "Paste a YouTube link and its lyrics, and it becomes playable for everyone."
              : "As soon as an admin adds the first song, it shows up right here."}
          </p>
          {isAdmin && (
            <Button className="mt-1 rounded-full" render={<Link href="/library/add" />} nativeButton={false}>
              Add the first song
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function ProgressPanel({
  streak,
  activityDays,
  xp,
  level,
  dueCount,
}: {
  streak: number;
  activityDays: number[];
  xp: number;
  level: number;
  dueCount: number;
}) {
  const today = startOfDay(Date.now());
  const activeDays = new Set(activityDays.map(startOfDay));
  const week = Array.from({ length: 7 }, (_, i) => {
    // Day boundaries via Date (not a fixed 24h step) so a DST change can't skip a day.
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    const day = startOfDay(date.getTime());
    return { day, active: activeDays.has(day), isToday: day === today };
  });
  const playedToday = activeDays.has(today);
  const xpIntoLevel = xp % XP_PER_LEVEL;

  return (
    <motion.section
      aria-label="Your progress"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.05 }}
      className="glass flex flex-col rounded-2xl p-5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-11 items-center justify-center rounded-xl",
            streak > 0 ? "bg-secondary/15 text-secondary" : "bg-muted text-muted-foreground",
          )}
        >
          <Flame className="size-6" fill={streak > 0 ? "currentColor" : "none"} />
        </span>
        <div>
          <p className="font-display text-2xl leading-none font-semibold tabular-nums">
            {streak} <span className="text-base font-normal text-muted-foreground">{streak === 1 ? "day" : "days"}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {playedToday ? "Streak safe for today" : streak > 0 ? "Play today to keep it" : "Start a streak today"}
          </p>
        </div>
      </div>

      <ol aria-label="Last 7 days" className="mt-5 grid grid-cols-7 gap-1.5">
        {week.map(({ day, active, isToday }) => (
          <li key={day} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : isToday
                    ? "border border-dashed border-secondary/60 text-muted-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {active ? <Flame aria-hidden className="size-3.5" fill="currentColor" /> : new Date(day).getDate()}
            </span>
            <span className={cn("text-[0.7rem]", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {isToday ? "Today" : new Date(day).toLocaleDateString("en-US", { weekday: "narrow" })}
            </span>
            <span className="sr-only">{active ? "played" : "no activity"}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">Level {level}</span>
          <span className="text-muted-foreground tabular-nums">
            {xpIntoLevel} / {XP_PER_LEVEL} XP
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Level ${level} progress`}
          aria-valuemin={0}
          aria-valuemax={XP_PER_LEVEL}
          aria-valuenow={xpIntoLevel}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <motion.div
            className="h-full origin-left rounded-full bg-secondary"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: xpIntoLevel / XP_PER_LEVEL }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </div>
      </div>

      <Link
        href="/review"
        className={cn(
          "group mt-4 flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200 lg:mt-auto",
          dueCount > 0 ? "bg-foreground text-background hover:bg-foreground/90" : "text-muted-foreground hover:bg-foreground/[0.04]",
        )}
      >
        <span className="flex items-center gap-2">
          {dueCount > 0 ? <BookOpenCheck aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />}
          {dueCount > 0 ? `Review ${dueCount} ${dueCount === 1 ? "word" : "words"}` : "Review is all caught up"}
        </span>
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </motion.section>
  );
}

function Shelf({ title, songs }: { title: string; songs: Song[] }) {
  return (
    <section className="mt-10 md:mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        <Link
          href="/library"
          className="rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          See all
        </Link>
      </div>
      {/* Swipeable on every width; the next card peeks in to show there's more. */}
      <div className="scroll-row -mx-4 flex scroll-px-4 snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-2 pb-2 md:gap-5">
        {songs.map((song, index) => (
          <SongCard key={song.id} song={song} index={index} className="w-[60vw] max-w-60 shrink-0 snap-start sm:w-56" />
        ))}
      </div>
    </section>
  );
}
