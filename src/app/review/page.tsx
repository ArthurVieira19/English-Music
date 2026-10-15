"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play, Trophy, X } from "lucide-react";
import type { WeakWord } from "@/types/WeakWord";
import { useLibraryStore } from "@/stores/libraryStore";
import { useReviewStore } from "@/stores/reviewStore";
import { useStatsStore } from "@/stores/statsStore";
import { ReviewSession, type ReviewSummary } from "@/components/review-session";
import { buildReviewCard } from "@/modules/review/reviewCard";
import { buildReviewItems, type ReviewItem } from "@/modules/review/reviewItems";
import { SRS_INTERVALS_DAYS } from "@/modules/review/spacedRepetition";
import { weakWordKey } from "@/modules/review/weakWordKey";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";

type ViewState = "idle" | "session" | "summary";
const DAY_MS = 24 * 60 * 60 * 1000;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export default function ReviewPage() {
  const weakWords = useReviewStore((s) => s.weakWords);
  const songs = useLibraryStore((s) => s.songs);
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
  // Words missed in the same line are one card, so the page counts cards, not words.
  const dueItems = useMemo(() => buildReviewItems(dueWords, songs), [dueWords, songs]);
  const nextItem = useMemo(
    () => dueItems[0] ?? buildReviewItems(sortedWords.slice(0, 1), songs)[0],
    [dueItems, sortedWords, songs],
  );

  function startSession(words: WeakWord[]) {
    setSessionWords(words);
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
    return (
      <ReviewSummaryScreen
        summary={summary}
        onReviewMore={() => startSession(dueWords)}
        moreDue={dueWords.length > 0}
      />
    );
  }

  return (
    <ReviewLanding
      words={sortedWords}
      dueLines={dueItems.length}
      nextItem={nextItem}
      onStart={() => startSession(dueWords)}
      onPractice={(word) => startSession([word])}
    />
  );
}

function ReviewLanding({
  words,
  dueLines,
  nextItem,
  onStart,
  onPractice,
}: {
  words: WeakWord[];
  dueLines: number;
  nextItem: ReviewItem | undefined;
  onStart: () => void;
  onPractice: (word: WeakWord) => void;
}) {
  const now = Date.now();
  const due = words.filter((w) => w.nextReviewAt <= now);
  const upcoming = words.filter((w) => w.nextReviewAt > now);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 pb-12 md:pt-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Review</h1>
        <p className="mt-1 text-muted-foreground text-pretty">
          When you miss a word in a song, that exact moment of the video comes back here. Hear it again and fill in
          the word; each time you get it right it returns later.
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
          {dueLines > 0 ? (
            <>
              <p className="font-display text-3xl font-semibold tracking-tight">
                {dueLines} {dueLines === 1 ? "line is" : "lines are"} due
              </p>
              <p className="mt-1 text-muted-foreground">
                {due.length} missed {due.length === 1 ? "word" : "words"} · About {Math.max(1, Math.round(dueLines * 0.5))}{" "}
                min. Counts toward today&apos;s streak.
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
                  : "Miss a word in any song and it lands here, with the moment of the video you heard it in."}
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

        <CardPreview item={nextItem} />
      </motion.section>

      {due.length > 0 && <WordGroup title="Due now" words={due} onPractice={onPractice} />}
      {upcoming.length > 0 && <WordGroup title="Coming up" words={upcoming} onPractice={onPractice} />}
    </div>
  );
}

function formatDue(timestamp: number | undefined): string {
  if (!timestamp) return "later";
  const days = Math.ceil((timestamp - Date.now()) / DAY_MS);
  if (days <= 1) return "tomorrow";
  return `in ${days} days`;
}

/** What a review card looks like, built from a real line, so the screen teaches the format before you start. */
function CardPreview({ item }: { item: ReviewItem | undefined }) {
  if (!item) {
    return (
      <div aria-hidden className="rounded-xl border border-dashed border-border px-5 py-6 text-center">
        <p className="font-display text-lg text-muted-foreground">
          I keep your <span className="mx-1 inline-block w-16 border-b-2 border-secondary/70 align-baseline" /> but I
          never call
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Each card replays a moment of a song, with the word you missed blanked out.
        </p>
      </div>
    );
  }

  const { tokens, blankIndices } = buildReviewCard(
    item.contextText,
    item.words.map((w) => w.word),
  );
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
      <figcaption className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        {item.video && <Play aria-hidden className="size-3.5 shrink-0 text-primary" fill="currentColor" />}
        <span className="truncate">
          From {item.songTitle} · {item.artist}
        </span>
      </figcaption>
    </figure>
  );
}

function WordGroup({
  title,
  words,
  onPractice,
}: {
  title: string;
  words: WeakWord[];
  onPractice: (word: WeakWord) => void;
}) {
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
            <li key={weakWordKey(word)} className="group flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold">{word.word}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {word.songTitle} · missed {word.timesWrong}×
                </p>
                <p className="truncate text-sm text-muted-foreground/70">&ldquo;{word.contextText}&rdquo;</p>
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
                onClick={() => onPractice(word)}
                aria-label={`Practice "${word.word}" from ${word.songTitle} now`}
                title="Practice this now"
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <Play aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => removeWord(word)}
                aria-label={`Forget "${word.word}" from ${word.songTitle} — stop tracking it for review`}
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
