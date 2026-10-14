"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Music2, Plus, Search, X } from "lucide-react";
import type { Difficulty } from "@/types/Difficulty";
import { SONGS } from "@/data/songs";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useStatsStore } from "@/stores/statsStore";
import { SongCard } from "@/components/song-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SortKey = "title" | "artist" | "difficulty";
type DifficultyFilter = "all" | Difficulty;
type PlayedFilter = "all" | "new" | "played";

const DIFFICULTY_ORDER: Difficulty[] = ["beginner", "intermediate", "advanced", "expert"];
const DIFFICULTY_FILTERS: DifficultyFilter[] = ["all", ...DIFFICULTY_ORDER];
const PLAYED_FILTERS: { value: PlayedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "played", label: "Played" },
];

const GRID = "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5";

function difficultyRank(difficulty: string): number {
  const rank = DIFFICULTY_ORDER.indexOf(difficulty as Difficulty);
  return rank === -1 ? DIFFICULTY_ORDER.length : rank;
}

/**
 * The full catalog. Today's pick and the "jump back in" shelves live on the
 * home screen, so this page is only about finding a song: one sticky toolbar,
 * one grid.
 */
export default function LibraryPage() {
  const librarySongs = useLibraryStore((s) => s.songs);
  const libraryStatus = useLibraryStore((s) => s.status);
  const removeSong = useLibraryStore((s) => s.removeSong);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const completedSongIds = useStatsStore((s) => s.progress.completedSongIds);

  // Only admins can remove songs from the global library (row level security enforces it too).
  const handleRemove = (songId: string) => {
    removeSong(songId).then(
      () => toast.success("Song removed from the library."),
      (error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't remove that song."),
    );
  };
  const onDelete = isAdmin ? handleRemove : undefined;

  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [playedFilter, setPlayedFilter] = useState<PlayedFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  const allSongs = useMemo(() => [...SONGS, ...librarySongs], [librarySongs]);
  const playedCount = useMemo(
    () => allSongs.filter((song) => completedSongIds.includes(song.id)).length,
    [allSongs, completedSongIds],
  );

  const filteredSongs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allSongs
      .filter((song) => playedFilter === "all" || completedSongIds.includes(song.id) === (playedFilter === "played"))
      .filter((song) => difficultyFilter === "all" || song.difficulty === difficultyFilter)
      .filter(
        (song) =>
          query.length === 0 ||
          song.title.toLowerCase().includes(query) ||
          song.artist.toLowerCase().includes(query),
      )
      .sort((a, b) => {
        if (sortKey === "difficulty") return difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
        return a[sortKey].localeCompare(b[sortKey]);
      });
  }, [allSongs, search, difficultyFilter, sortKey, playedFilter, completedSongIds]);

  if (allSongs.length === 0) {
    if (libraryStatus === "idle" || libraryStatus === "loading") return <LibrarySkeleton />;
    if (libraryStatus === "error") return <LibraryLoadError />;
    return <EmptyLibraryOnboarding isAdmin={isAdmin} />;
  }

  const clearFilters = () => {
    setSearch("");
    setDifficultyFilter("all");
    setPlayedFilter("all");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 md:pt-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Library</h1>
          <p className="mt-1 text-muted-foreground">
            {allSongs.length} {allSongs.length === 1 ? "song" : "songs"}
            {playedCount > 0 && ` · you've played ${playedCount}`}
          </p>
        </div>
        {isAdmin && (
          <Button
            className="h-10 shrink-0 gap-1.5 rounded-full px-4"
            render={<Link href="/library/add" />}
            nativeButton={false}
          >
            <Plus aria-hidden className="size-4" />
            <span className="hidden sm:inline">Add song</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </div>

      {/* Sticks under the site header so filters stay in reach while scrolling a long catalog. */}
      <div className="sticky top-16 z-20 -mx-4 mb-6 bg-background/85 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Phones: search and sort share a row. lg: "contents" dissolves the row into the toolbar's single line. */}
          <div className="flex gap-2 lg:contents">
            <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none lg:shrink-0">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Search songs by title or artist"
                placeholder="Search title or artist"
                className="h-10 rounded-full pr-10 pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
            <SortSelect value={sortKey} onChange={setSortKey} className="h-10 lg:hidden" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="scroll-row -mx-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <ChipGroup
                label="Filter by played status"
                layoutId="library-played-pill"
                options={PLAYED_FILTERS}
                value={playedFilter}
                onChange={setPlayedFilter}
              />
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
              <ChipGroup
                label="Filter by difficulty"
                layoutId="library-difficulty-pill"
                options={DIFFICULTY_FILTERS.map((level) => ({
                  value: level,
                  label: level === "all" ? "Any level" : level[0].toUpperCase() + level.slice(1),
                }))}
                value={difficultyFilter}
                onChange={setDifficultyFilter}
              />
            </div>

            <SortSelect value={sortKey} onChange={setSortKey} className="hidden h-9 lg:block" />
          </div>
        </div>
      </div>

      {filteredSongs.length > 0 ? (
        <div className={GRID}>
          {filteredSongs.map((song, index) => (
            <SongCard key={song.id} song={song} index={index} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-14 text-center">
          <Search aria-hidden className="size-6 text-muted-foreground" />
          <p className="font-medium">No songs match those filters</p>
          <p className="max-w-xs text-sm text-muted-foreground text-pretty">
            {search.trim() ? `Nothing for “${search.trim()}”. ` : ""}Try a different level, or clear everything to see all {allSongs.length}.
          </p>
          <Button variant="outline" className="mt-1 rounded-full" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function SortSelect({
  value,
  onChange,
  className,
}: {
  value: SortKey;
  onChange: (value: SortKey) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="Sort songs by"
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className={cn(
        "shrink-0 rounded-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <option value="title">Sort: Title</option>
      <option value="artist">Sort: Artist</option>
      <option value="difficulty">Sort: Level</option>
    </select>
  );
}

function ChipGroup<T extends string>({
  label,
  layoutId,
  options,
  value,
  onChange,
}: {
  label: string;
  layoutId: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 gap-1">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative min-h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors duration-200",
              isActive ? "font-medium text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 rounded-full bg-foreground"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Same grid as the real page, so nothing jumps when the songs arrive. */
function LibrarySkeleton() {
  return (
    <div role="status" aria-label="Loading library" className="mx-auto max-w-6xl px-4 pt-8 pb-12 md:pt-12">
      <div className="mb-5 h-9 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-10 w-full animate-pulse rounded-full bg-muted/70 lg:w-80" />
      <div className={GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="aspect-video animate-pulse rounded-lg bg-muted" />
            <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-3.5 w-1/2 animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryLoadError() {
  const load = useLibraryStore((s) => s.load);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <h1 className="font-display text-xl font-semibold">Couldn&apos;t load the library</h1>
      <p className="mt-2 text-muted-foreground text-pretty">Check your connection and try again.</p>
      <Button className="mt-5" onClick={() => void load()}>
        Try again
      </Button>
    </div>
  );
}

/**
 * The global library starts empty (licensing means no songs are bundled with
 * the app, see data/songs.ts). Only admins can fill it, so players who can't
 * add anything get an explanation instead of a dead-end button.
 */
function EmptyLibraryOnboarding({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center md:py-24">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="glass flex size-16 items-center justify-center rounded-2xl text-primary"
      >
        <Music2 aria-hidden className="size-7" />
      </motion.div>

      <h1 className="mt-5 font-display text-2xl font-semibold">The library is empty</h1>
      {isAdmin ? (
        <>
          <p className="mt-2 text-muted-foreground text-pretty">
            English Cafe Club doesn&apos;t ship with songs built in — pick any track on YouTube, paste the link, and
            we&apos;ll try to find synced lyrics for it automatically. Songs you add are shared with every
            player.
          </p>

          <Button
            size="lg"
            className="group mt-6 h-11 gap-2 rounded-full px-6"
            render={<Link href="/library/add" />}
            nativeButton={false}
          >
            Add the first song
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </>
      ) : (
        <p className="mt-2 text-muted-foreground text-pretty">
          No songs have been added yet. Check back soon — new songs show up here as soon as an admin
          adds them.
        </p>
      )}
    </div>
  );
}
