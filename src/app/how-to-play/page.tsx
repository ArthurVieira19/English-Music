"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CloudCheck,
  Ear,
  Gauge,
  Keyboard,
  ListMusic,
  RotateCcw,
  Turtle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** A real sequence, so it's the one place numbers belong. */
const ROUND: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ListMusic,
    title: "Pick a song",
    body: "Start from today's pick on the home screen, or browse the library by level.",
  },
  {
    icon: Gauge,
    title: "Choose how hard",
    body: "Type each word, pick from four options, or use the word bank. Then a level: ten steps from Beginner 1 to Expert, and a 4-star run moves you up one.",
  },
  {
    icon: Ear,
    title: "Listen and fill the gaps",
    body: "The video plays and the lyrics follow along. When a line comes up, its blanks light up. Type what you hear.",
  },
];

const HELPERS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: RotateCcw,
    title: "Missed it? It waits for you",
    body: "If a line ends before you finish, the music fades and stops right there. Fill the blank when you're ready, or replay the line.",
  },
  {
    icon: Turtle,
    title: "Slow it down",
    body: "Drop to 0.75x or 0.5x from the transport bar for fast verses. The pitch stays natural.",
  },
  {
    icon: Keyboard,
    title: "Close enough counts",
    body: "A missing apostrophe or one letter off still confirms the blank. In an empty blank, Backspace replays the line and Enter skips the word; on a phone, swipe the line.",
  },
  {
    icon: BookOpen,
    title: "Tap any word you don't know",
    body: "Every visible word opens its definition and pronunciation, without stopping the song.",
  },
];

const AFTER: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BookOpenCheck,
    title: "Words you miss come back",
    body: "Every missed word goes to Review, with the line it came from. It returns after 1, 3, 7, 16 and 35 days, the spacing that makes words stick.",
  },
  {
    icon: CloudCheck,
    title: "Saved to your account",
    body: "XP, streaks, achievements and review words sync as you play, so you can pick up on any device.",
  },
];

export default function HowToPlayPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-14 md:pt-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">How to play</h1>
        <p className="mt-2 text-muted-foreground text-pretty md:text-lg">
          A round takes one song, about three minutes. Here&apos;s everything that happens in it, and after it.
        </p>
      </header>

      <section aria-labelledby="round-title" className="mt-10">
        <h2 id="round-title" className="font-display text-lg font-semibold">
          A round, start to finish
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {ROUND.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT, delay: index * 0.06 }}
                className="glass relative rounded-2xl p-5"
              >
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden
                    className="flex size-9 items-center justify-center rounded-full bg-foreground font-display text-sm font-semibold text-background"
                  >
                    {index + 1}
                  </span>
                  <Icon aria-hidden className="size-5 text-muted-foreground" />
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">{step.body}</p>
              </motion.li>
            );
          })}
        </ol>
      </section>

      <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-12">
        <FeatureList title="When it gets tough" items={HELPERS} columns />
        <FeatureList title="After the song ends" items={AFTER} />
      </div>

      <div className="mt-12 flex flex-col items-start gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">That&apos;s all of it. The best way to learn it is one song.</p>
        <Button
          size="lg"
          className="group h-11 gap-2 rounded-full px-6"
          render={<Link href="/" />}
          nativeButton={false}
        >
          Play today&apos;s pick
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </div>
  );
}

function FeatureList({
  title,
  items,
  columns = false,
}: {
  title: string;
  items: { icon: LucideIcon; title: string; body: string }[];
  columns?: boolean;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ul className={columns ? "mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2" : "mt-4 grid gap-6"}>
        {items.map(({ icon: Icon, title: itemTitle, body }) => (
          <li key={itemTitle} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-primary"
            >
              <Icon className="size-[1.125rem]" />
            </span>
            <div>
              <h3 className="font-semibold">{itemTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
