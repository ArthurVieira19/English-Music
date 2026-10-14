"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame, Lock } from "lucide-react";
import type { Song } from "@/types/Song";
import type { SongResult } from "@/types/Statistics";
import { findSong } from "@/data/songs";
import { useStatsStore } from "@/stores/statsStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { useReviewStore } from "@/stores/reviewStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { ACHIEVEMENT_RULES } from "@/modules/achievements/achievementEngine";
import { startOfDay } from "@/modules/stats/statsCalculator";
import { XP_PER_LEVEL } from "@/modules/stats/xpEngine";
import { useCountUp } from "@/hooks/useCountUp";
import { SongThumbnail, songHref } from "@/components/song-card";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const CALENDAR_WEEKS = 15;
const RECENT_SESSIONS = 6;

function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value, 700)}</>;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatWhen(timestamp: number): string {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function StatisticsPage() {
  const statistics = useStatsStore((s) => s.statistics);
  const progress = useStatsStore((s) => s.progress);
  const achievements = useAchievementStore((s) => s.achievements);
  const weakWordCount = useReviewStore((s) => s.weakWords.length);
  const librarySongs = useLibraryStore((s) => s.songs);
  const unlockedIds = new Set(achievements.map((a) => a.id));

  const recentSessions = useMemo(
    () =>
      statistics.history
        .slice(-RECENT_SESSIONS)
        .reverse()
        .map((result) => ({ result, song: findSong(result.songId, librarySongs) })),
    [statistics.history, librarySongs],
  );

  const totals = [
    { label: "Songs completed", value: statistics.songsCompleted.toLocaleString("en-US") },
    { label: "Average accuracy", value: `${statistics.averageAccuracy.toFixed(0)}%` },
    { label: "Best score", value: statistics.bestScore.toLocaleString("en-US") },
    { label: "Time listening", value: formatDuration(statistics.totalPlayTimeMs) },
    { label: "Words mastered", value: progress.wordsMastered.toLocaleString("en-US") },
    { label: "Words in review", value: weakWordCount.toLocaleString("en-US") },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pt-8 pb-12 md:pt-12">
      <div className="mb-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Statistics</h1>
        <p className="mt-1 text-muted-foreground">How your listening is adding up.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <LevelPanel xp={progress.xp} level={progress.level} />
        <CalendarPanel
          activityDays={progress.activityDays}
          streak={statistics.currentStreak}
          longest={statistics.longestStreak}
        />
      </div>

      <section aria-label="Totals" className="glass rounded-2xl">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {totals.map(({ label, value }, i) => (
            <div
              key={label}
              className={cn(
                "flex flex-col-reverse gap-1 px-5 py-4",
                // Hairlines between cells, matching each breakpoint's column count.
                i % 2 === 1 && "border-l border-border sm:border-l-0",
                i % 3 !== 0 && "sm:border-l sm:border-border lg:border-l-0",
                i > 0 && "lg:border-l lg:border-border",
                i >= 2 && "border-t border-border sm:border-t-0",
                i >= 3 && "sm:border-t sm:border-border lg:border-t-0",
              )}
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <RecentSessions sessions={recentSessions} />

        <section aria-labelledby="achievements-title" className="glass rounded-2xl p-5">
          <div className="flex items-baseline justify-between">
            <h2 id="achievements-title" className="font-display text-lg font-semibold">
              Achievements
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {achievements.length} of {ACHIEVEMENT_RULES.length}
            </span>
          </div>
          <ul className="mt-4 grid gap-1">
            {ACHIEVEMENT_RULES.map((rule, index) => {
              const isUnlocked = unlockedIds.has(rule.id);
              return (
                <motion.li
                  key={rule.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT, delay: index * 0.03 }}
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full text-lg",
                      isUnlocked ? "bg-secondary/15 ring-1 ring-secondary/40" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isUnlocked ? rule.icon : <Lock className="size-4" />}
                  </span>
                  <div className={cn("min-w-0", !isUnlocked && "opacity-70")}>
                    {!isUnlocked && <span className="sr-only">Locked: </span>}
                    <p className="text-sm font-semibold">{rule.title}</p>
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function LevelPanel({ xp, level }: { xp: number; level: number }) {
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const fraction = xpIntoLevel / XP_PER_LEVEL;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <section aria-label="Level" className="glass flex items-center gap-5 rounded-2xl p-5 sm:p-6">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="9" className="stroke-muted" />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-secondary"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - fraction) }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">Level</span>
          <span className="font-display text-4xl leading-none font-semibold tabular-nums">
            <CountUp value={level} />
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold tabular-nums">
          {XP_PER_LEVEL - xpIntoLevel} <span className="text-base font-normal text-muted-foreground">XP to go</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {xpIntoLevel} / {XP_PER_LEVEL} into level {level}
        </p>
        <p className="mt-3 text-sm text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">{xp.toLocaleString("en-US")}</span> XP all time
        </p>
      </div>
      <span className="sr-only">
        {xpIntoLevel} of {XP_PER_LEVEL} XP toward level {level + 1}
      </span>
    </section>
  );
}

/** A GitHub-style grid of the last weeks: one cell per day, lit when you played or reviewed. */
function CalendarPanel({ activityDays, streak, longest }: { activityDays: number[]; streak: number; longest: number }) {
  const { weeks, activeCount } = useMemo(() => {
    const active = new Set(activityDays.map(startOfDay));
    const today = new Date(startOfDay(Date.now()));
    // Start on the Sunday CALENDAR_WEEKS-1 weeks back so columns are whole weeks.
    const start = new Date(today);
    start.setDate(start.getDate() - today.getDay() - (CALENDAR_WEEKS - 1) * 7);

    const weeks: { day: number; active: boolean; future: boolean }[][] = [];
    let activeCount = 0;
    for (let w = 0; w < CALENDAR_WEEKS; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const day = startOfDay(date.getTime());
        const isActive = active.has(day);
        if (isActive) activeCount++;
        week.push({ day, active: isActive, future: day > today.getTime() });
      }
      weeks.push(week);
    }
    return { weeks, activeCount };
  }, [activityDays]);

  return (
    <section aria-labelledby="calendar-title" className="glass flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
            <h2 id="calendar-title" className="font-display text-2xl leading-none font-semibold tabular-nums">
              <CountUp value={streak} />{" "}
              <span className="text-base font-normal text-muted-foreground">day streak</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Best ever: {longest} {longest === 1 ? "day" : "days"}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {activeCount} active {activeCount === 1 ? "day" : "days"} in {CALENDAR_WEEKS} weeks
        </p>
      </div>

      <div className="scroll-row overflow-x-auto">
        <div
          role="img"
          aria-label={`Activity calendar: ${activeCount} active days in the last ${CALENDAR_WEEKS} weeks`}
          className="grid min-w-max grid-flow-col grid-rows-7 gap-[3px]"
        >
          {weeks.flat().map(({ day, active, future }) => (
            <span
              key={day}
              title={new Date(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              className={cn(
                "size-3.5 rounded-[3px] sm:size-4",
                future ? "bg-transparent" : active ? "bg-secondary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentSessions({ sessions }: { sessions: { result: SongResult; song: Song | undefined }[] }) {
  return (
    <section aria-labelledby="recent-title" className="glass rounded-2xl p-5">
      <h2 id="recent-title" className="font-display text-lg font-semibold">
        Recent sessions
      </h2>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Finish a song and it shows up here, with your score and accuracy.{" "}
          <Link href="/library" className="font-medium text-primary underline-offset-4 hover:underline">
            Pick one
          </Link>
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {sessions.map(({ result, song }) => (
            <li key={`${result.songId}-${result.completedAt}`}>
              <SessionRow result={result} song={song} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SessionRow({ result, song }: { result: SongResult; song: Song | undefined }) {
  const accuracy = Math.round(result.accuracy);
  const body = (
    <>
      {song ? (
        <SongThumbnail song={song} className="w-16 shrink-0 rounded-md" />
      ) : (
        <span className="aspect-video w-16 shrink-0 rounded-md bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{song?.title ?? "Removed song"}</p>
        <p className="truncate text-sm text-muted-foreground">{formatWhen(result.completedAt)}</p>
      </div>
      <div className="w-24 shrink-0 sm:w-32">
        <div className="flex items-baseline justify-between text-sm tabular-nums">
          <span className={cn("font-semibold", accuracy >= 80 ? "text-secondary" : "text-foreground")}>{accuracy}%</span>
          <span className="text-muted-foreground">{result.score.toLocaleString("en-US")}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", accuracy >= 80 ? "bg-secondary" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }}
          />
        </div>
      </div>
    </>
  );

  return song ? (
    <Link href={songHref(song)} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-foreground/[0.04]">
      {body}
      <span className="sr-only">Play again</span>
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-2.5">{body}</div>
  );
}

