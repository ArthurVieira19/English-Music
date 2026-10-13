"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy } from "lucide-react";
import { songScoreService, type SongBoardResult } from "@/services/leaderboard/songScoreService";
import { ordinal } from "@/modules/leaderboard/leaderboard";
import { isBelowBoard, type ScoreSubmissionState, type SongScoreEntry } from "@/modules/leaderboard/songScores";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MODE_LABELS: Record<string, string> = {
  typing: "Typing",
  multipleChoice: "Multiple choice",
  wordBank: "Word bank",
  fullPhrase: "Full phrase",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface SongRankingCardProps {
  songId: string;
  difficulty: string;
  mode: string;
  submission: ScoreSubmissionState | null;
}

/**
 * Where this run landed among everyone who played the same song at the same
 * difficulty and answer mode. Draws nothing when the score wasn't ranked
 * (offline, SQL not set up, a rejected score): the player never signed up
 * for a ranking they can't see, so there is no error to show.
 */
export function SongRankingCard({ songId, difficulty, mode, submission }: SongRankingCardProps) {
  const [board, setBoard] = useState<SongBoardResult | null>(null);
  const saved = submission?.status === "saved";

  useEffect(() => {
    if (!saved) return;
    let cancelled = false;
    void songScoreService.loadBoard(songId, difficulty, mode).then((result) => {
      if (!cancelled) setBoard(result);
    });
    return () => {
      cancelled = true;
    };
  }, [saved, songId, difficulty, mode]);

  if (!submission || submission.status === "skipped") return null;

  if (submission.status === "pending" || !board) {
    return (
      <section aria-label="Song ranking" className="glass mt-6 w-full space-y-3 rounded-2xl p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </section>
    );
  }

  if (!board.ok) return null;

  const { place, bestScore, isNewBest } = submission.submission;
  const label = `${capitalize(difficulty)} · ${MODE_LABELS[mode] ?? mode}`;

  return (
    <section aria-label="Song ranking" className="glass mt-6 w-full overflow-hidden rounded-2xl text-left">
      <header className="flex items-start gap-3 p-4">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Trophy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">
            {isNewBest ? `You're ${ordinal(place)} on this song` : `Your best puts you ${ordinal(place)}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {label}
            {isNewBest ? " · new personal best" : ` · best ${bestScore.toLocaleString("en-US")}`}
          </p>
        </div>
      </header>

      {board.entries.length > 0 && (
        <ol className="divide-y divide-border border-t border-border">
          {board.entries.map((entry, index) => (
            <RankingRow key={entry.userId} entry={entry} separated={isBelowBoard(entry) && index > 0} />
          ))}
        </ol>
      )}
    </section>
  );
}

function RankingRow({ entry, separated }: { entry: SongScoreEntry; separated: boolean }) {
  return (
    <>
      {separated && (
        <li aria-hidden className="py-1 text-center text-muted-foreground">
          ⋯
        </li>
      )}
      <li
        aria-label={`${ordinal(entry.place)}: ${entry.displayName}${entry.isMe ? " (you)" : ""}, ${entry.score} points, ${Math.round(entry.accuracy)}% accuracy`}
        className={cn("flex items-center gap-3 px-4 py-2.5", entry.isMe && "bg-primary/10")}
      >
        {entry.place === 1 ? (
          <Crown aria-hidden className="mx-1.5 size-5 shrink-0 text-amber-400" />
        ) : (
          <span aria-hidden className="w-8 shrink-0 text-center font-display font-semibold tabular-nums text-muted-foreground">
            {entry.place}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate font-medium">
          {entry.displayName}
          {entry.isMe && <span className="ml-1.5 text-xs font-normal text-primary">(you)</span>}
        </p>
        <p className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">{Math.round(entry.accuracy)}%</p>
        <p className="shrink-0 font-display text-lg font-semibold tabular-nums">{entry.score.toLocaleString("en-US")}</p>
      </li>
    </>
  );
}
