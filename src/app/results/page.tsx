"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Music2, RotateCcw, TrendingUp } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { findSong } from "@/data/songs";
import { useLibraryStore } from "@/stores/libraryStore";
import { Button } from "@/components/ui/button";
import { AmbientArt } from "@/components/ambient-art";
import { SongRankingCard } from "@/components/song-ranking-card";
import { StarRating } from "@/components/star-rating";
import { PROMOTION_STARS, levelLabel, parseLevelId } from "@/modules/game/levels";
import { CelebrationBurst } from "@/components/celebration-burst";
import { SongThumbnail, songHref } from "@/components/song-card";
import { useCountUp } from "@/hooks/useCountUp";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Praise that matches the run, so a 40% round isn't congratulated like a perfect one. */
function verdict(accuracy: number): { title: string; line: string } {
  if (accuracy >= 95) return { title: "Flawless ear", line: "You caught nearly every word." };
  if (accuracy >= 80) return { title: "Great listening", line: "Most of it landed. The misses are waiting in Review." };
  if (accuracy >= 55) return { title: "Solid run", line: "Play it once more and watch the number climb." };
  return { title: "Every listen counts", line: "The words you missed are saved for Review, and the song gets easier each time." };
}

export default function ResultsPage() {
  const lastResult = useGameStore((s) => s.lastResult);
  const scoreSubmission = useGameStore((s) => s.scoreSubmission);
  const librarySongs = useLibraryStore((s) => s.songs);
  const score = useCountUp(lastResult?.score ?? 0);

  if (!lastResult) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span aria-hidden className="glass flex size-14 items-center justify-center rounded-2xl text-muted-foreground">
          <Music2 className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold">No results yet</h1>
        <p className="mt-1 text-muted-foreground">Finish a song and your score shows up here.</p>
        <Button className="mt-5 rounded-full" render={<Link href="/" />} nativeButton={false}>
          Play today&apos;s pick
        </Button>
      </div>
    );
  }

  const song = findSong(lastResult.songId, librarySongs);
  const { title, line } = verdict(lastResult.accuracy);
  const playedLevel = parseLevelId(lastResult.level);
  const newLevel = parseLevelId(lastResult.levelUp);

  return (
    <div className="relative isolate mx-auto flex max-w-xl flex-col items-center px-4 pt-10 pb-14 text-center md:pt-14">
      {song && <AmbientArt song={song} />}

      <div className="relative">
        <CelebrationBurst />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          {song ? (
            <SongThumbnail
              song={song}
              className="w-52 rounded-xl shadow-[0_8px_8px_-6px_oklch(0_0_0/50%)] ring-1 ring-foreground/10"
            />
          ) : (
            <span className="glass flex size-20 items-center justify-center rounded-2xl text-secondary">
              <Music2 aria-hidden className="size-8" />
            </span>
          )}
        </motion.div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">{song ? `${song.title} · ${song.artist}` : "Song complete"}</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-1 max-w-sm text-muted-foreground text-pretty">{line}</p>

      <div className="my-8">
        <p className="font-display text-6xl font-bold text-secondary tabular-nums">{score}</p>
        <p className="mt-1 text-sm text-muted-foreground">points</p>
        {lastResult.stars !== undefined && <StarRating value={lastResult.stars} className="mt-3" />}
        {playedLevel && !newLevel && (
          <p className="mt-2 text-sm text-muted-foreground">
            {levelLabel(playedLevel)} · {PROMOTION_STARS} stars moves you up a level
          </p>
        )}
      </div>

      {newLevel && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.3 }}
          className="glass mb-6 flex w-full items-center gap-3 rounded-2xl border-secondary/40 px-4 py-3 text-left"
        >
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
            <TrendingUp className="size-5" />
          </span>
          <p className="text-sm">
            <span className="font-semibold text-foreground">Level up: {levelLabel(newLevel)}.</span>{" "}
            <span className="text-muted-foreground">Your next song will hide a few more words.</span>
          </p>
        </motion.div>
      )}

      <motion.dl
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.2 }}
        className="glass grid w-full grid-cols-3 divide-x divide-border rounded-xl"
      >
        {[
          { label: "Accuracy", value: `${lastResult.accuracy.toFixed(0)}%` },
          { label: "Best combo", value: `×${lastResult.maxCombo}` },
          { label: "Words caught", value: `${lastResult.correctAnswers}/${lastResult.totalAnswers}` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col-reverse gap-0.5 px-3 py-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </motion.dl>

      {lastResult.mode && (
        <SongRankingCard
          songId={lastResult.songId}
          difficulty={lastResult.difficulty}
          mode={lastResult.mode}
          submission={scoreSubmission}
        />
      )}

      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {song && (
          <Button
            className="h-11 gap-2 rounded-full px-6 text-base"
            render={<Link href={songHref(song)} />}
            nativeButton={false}
          >
            <RotateCcw aria-hidden className="size-4" />
            Play again
          </Button>
        )}
        <Button variant="outline" className="h-11 rounded-full px-6" render={<Link href="/library" />} nativeButton={false}>
          Another song
        </Button>
        <Button variant="ghost" className="h-11 rounded-full px-6" render={<Link href="/review" />} nativeButton={false}>
          Review missed words
        </Button>
      </div>
    </div>
  );
}
