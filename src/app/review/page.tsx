"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Trophy, X } from "lucide-react";
import type { WeakWord } from "@/types/WeakWord";
import { useReviewStore } from "@/stores/reviewStore";
import { useStatsStore } from "@/stores/statsStore";
import { ReviewSession, type ReviewSummary } from "@/components/review-session";
import { buildReviewCard } from "@/modules/review/reviewCard";
import { SRS_INTERVALS_DAYS } from "@/modules/review/spacedRepetition";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

type ViewState = "idle" | "session" | "summary";
const DAY_MS = 24 * 60 * 60 * 1000;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export default function ReviewPage() {
  const weakWords = useReviewStore((s) => s.weakWords);
  const addXp = useStatsStore((s) => s.addXp);

  const [view, setView] = useState<ViewState>("idle");
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  // Snapshotted once per session so the deck doesn't shift under the player
  // as recordCorrect/recordMiss mutate the store mid-session.
  const [sessionWords, setSessionWords] = useState<typeof weakWords>([]);

  const sortedWords = useMemo(
    () => [...weakWords].sort((a, b) => a.nextReviewAt - b.nextReviewAt),
    [weakWords],
  );
  const dueWords = useMemo(
    () => sortedWords.filter((w) => w.nextReviewAt <= Date.now()),
    [sortedWords],
  );

  function startSession() {
    setSessionWords(dueWords);
    setSummary(null);
    setView("session");
  }

  function handleFinish(result: ReviewSummary) {
    // The streak day itself is recorded per answer inside ReviewSession.
    if (result.xpEarned > 0) addXp(result.xpEarned);
    setSummary(result);
    setView("summary");
  }

  if (view === "session" && sessionWords.length > 0) {
    return <ReviewSession words={sessionWords} onFinish={handleFinish} />;
  }

  if (view === "summary" && summary) {
    return <ReviewSummaryScreen summary={summary} onReviewMore={startSession} moreDue={dueWords.length > 0} />;
  }

  return <ReviewLanding words={sortedWords} dueCount={dueWords.length} onStart={startSession} />;
}

function ReviewLanding({
  words,
  dueCount,
  onStart,
}: {
  words: WeakWord[];
  dueCount: number;
  onStart: () => void;
}) {
  const now = Date.now();
  const due = words.filter((w) => w.nextReviewAt <= now);
  const upcoming = words.filter((w) => w.nextReviewAt > now);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 pb-12 md:pt-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Review</h1>
        <p className="mt-1 text-muted-foreground text-pretty">
          Words you missed in any song come back here, spaced further apart each time you get them right.
        </p>
      </header>

      <motion.section
        aria-label="Today's review"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        // Navy brand panel in both themes; `dark` gives everything inside the dark-theme tokens.
        className="navy-stage dark mt-6 grid gap-6 rounded-2xl p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center"
      >
        <div>
          {dueCount > 0 ? (
            <>
              <p className="font-display text-3xl font-semibold tracking-tight">
                {dueCount} {dueCount === 1 ? "word is" : "words are"} due
              </p>
              <p className="mt-1 text-muted-foreground">
                About {Math.max(1, Math.round(dueCount * 0.25))} min. Counts toward today&apos;s streak.
              </p>
              <Button size="lg" className="group mt-5 h-11 gap-2 rounded-full px-6 text-base" onClick={onStart}>
                Start review
                <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </>
          ) : (
            <>
              <p className="font-display text-3xl font-semibold tracking-tight">
                {words.length > 0 ? "All caught up" : "Nothing to review yet"}
              </p>
              <p className="mt-1 text-muted-foreground text-pretty">
                {words.length > 0
                  ? `The next ${upcoming.length === 1 ? "word comes" : "words come"} back ${formatDue(upcoming[0]?.nextReviewAt)}.`
                  : "Miss a word in any song and it lands here, with the line you heard it in."}
              </p>
              <Button
                variant="outline"
                className="mt-5 h-11 rounded-full px-6"
                render={<Link href="/" />}
                nativeButton={false}
              >
                Play a song
              </Button>
            </>
          )}
        </div>

        <CardPreview word={due[0] ?? upcoming[0]} />
      </motion.section>

      {due.length > 0 && <WordGroup title="Due now" words={due} />}
      {upcoming.length > 0 && <WordGroup title="Coming up" words={upcoming} />}
    </div>
  );
}

function formatDue(timestamp: number | undefined): string {
  if (!timestamp) return "later";
  const days = Math.ceil((timestamp - Date.now()) / DAY_MS);
  if (days <= 1) return "tomorrow";
  return `in ${days} days`;
}

/** What a review card looks like, built from a real word, so the screen teaches the format before you start. */
function CardPreview({ word }: { word: WeakWord | undefined }) {
  if (!word) {
    return (
      <div aria-hidden className="rounded-xl border border-dashed border-border px-5 py-6 text-center">
        <p className="font-display text-lg text-muted-foreground">
          I keep your <span className="mx-1 inline-block w-16 border-b-2 border-secondary/70 align-baseline" /> but I
          never call
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Each card is a line from a song, with the word you missed blanked out.
        </p>
      </div>
    );
  }

  const { tokens, blankIndices } = buildReviewCard(word.contextText, word.word);
  return (
    <figure className="rounded-xl bg-background/60 px-5 py-5 ring-1 ring-border">
      <blockquote className="font-display text-lg leading-relaxed text-balance">
        {tokens.map((token, i) => (
          <span key={i}>
            {i > 0 && " "}
            {blankIndices.has(i) ? (
              <span className="inline-block w-16 border-b-2 border-secondary align-baseline">
                <span className="sr-only">blank</span>
              </span>
            ) : (
              token
            )}
          </span>
        ))}
      </blockquote>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        From {word.songTitle} · {word.artist}
      </figcaption>
    </figure>
  );
}

function WordGroup({ title, words }: { title: string; words: WeakWord[] }) {
  const removeWord = useReviewStore((s) => s.removeWord);

  return (
    <section className="mt-10">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{words.length}</span>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {words.map((word) => {
          const daysUntilDue = Math.ceil((word.nextReviewAt - Date.now()) / DAY_MS);
          const isDue = daysUntilDue <= 0;

          return (
            <li key={word.word} className="group flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold">{word.word}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {word.songTitle} · missed {word.timesWrong}×
                </p>
              </div>
              <LadderDots step={word.intervalIndex} />
              <span
                className={cn(
                  "w-14 shrink-0 text-right text-sm tabular-nums",
                  isDue ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                {isDue ? "Now" : `in ${daysUntilDue}d`}
              </span>
              <button
                type="button"
                onClick={() => removeWord(word.word)}
                aria-label={`Forget "${word.word}" — stop tracking it for review`}
                title="Forget this word"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-[color,background-color,opacity] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Progress up the spaced-repetition ladder: a word is mastered after the last rung. */
function LadderDots({ step }: { step: number }) {
  const rung = Math.min(step, SRS_INTERVALS_DAYS.length);
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:flex" title={`Step ${rung} of ${SRS_INTERVALS_DAYS.length} to mastered`}>
      {SRS_INTERVALS_DAYS.map((days, i) => (
        <span key={days} aria-hidden className={cn("size-1.5 rounded-full", i < step ? "bg-secondary" : "bg-muted")} />
      ))}
      <span className="sr-only">
        Step {rung} of {SRS_INTERVALS_DAYS.length} to mastered
      </span>
    </span>
  );
}

function ReviewSummaryScreen({
  summary,
  onReviewMore,
  moreDue,
}: {
  summary: ReviewSummary;
  onReviewMore: () => void;
  moreDue: boolean;
}) {
  const xp = useCountUp(summary.xpEarned);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 pt-12 pb-14 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="flex size-16 items-center justify-center rounded-2xl bg-secondary/15 text-secondary"
      >
        <Trophy aria-hidden className="size-7" />
      </motion.div>

      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Review complete</h1>
      <p className="mt-1 text-muted-foreground">Those words will come back around, a little further apart.</p>

      <div className="my-8">
        <p className="font-display text-6xl font-bold text-secondary tabular-nums">+{xp}</p>
        <p className="mt-1 text-sm text-muted-foreground">XP earned</p>
      </div>

      <dl className="glass grid w-full grid-cols-3 divide-x divide-border rounded-xl">
        {[
          { label: "Reviewed", value: summary.totalReviewed },
          { label: "Correct", value: `${summary.correctCount}/${summary.totalReviewed}` },
          { label: "Mastered", value: summary.masteredCount },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col-reverse gap-0.5 px-3 py-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {moreDue && (
          <Button className="h-11 rounded-full px-6" onClick={onReviewMore}>
            Keep reviewing
          </Button>
        )}
        <Button variant="outline" className="h-11 rounded-full px-6" render={<Link href="/" />} nativeButton={false}>
          Back home
        </Button>
      </div>
    </div>
  );
}
