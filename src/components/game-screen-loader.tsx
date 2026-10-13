"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { findSong } from "@/data/songs";
import type { GameMode } from "@/types/GameMode";
import { useLibraryStore } from "@/stores/libraryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { GameScreen } from "@/components/game-screen";
import { GameModeSelector } from "@/components/game-mode-selector";
import { DifficultySelector } from "@/components/difficulty-selector";
import { levelId, type Level } from "@/modules/game/levels";

/** Resolves a song from the built-in catalog or the global library. */
export function GameScreenLoader({ songId }: { songId: string }) {
  const librarySongs = useLibraryStore((s) => s.songs);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const song = findSong(songId, librarySongs);

  const [mode, setMode] = useState<GameMode | null>(null);
  const [level, setLevel] = useState<Level | null>(null);

  // A different song means starting over: make the player pick a mode and
  // difficulty for it too, instead of silently carrying over the last
  // song's choices.
  useEffect(() => {
    setMode(null);
    setLevel(null);
  }, [songId]);

  if (!song) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground">This song couldn&apos;t be found.</p>
        <Button className="mt-4" render={<Link href="/library" />} nativeButton={false}>
          Back to library
        </Button>
      </div>
    );
  }

  if (!mode) {
    return (
      <GameModeSelector
        song={song}
        onSelect={(selected) => {
          updateSettings({ defaultGameMode: selected });
          setMode(selected);
        }}
      />
    );
  }

  if (!level) {
    return (
      <DifficultySelector
        song={song}
        onBack={() => setMode(null)}
        onSelect={(selected) => {
          // The level a player picks becomes their level: the next song offers it again.
          updateSettings({ defaultDifficulty: selected.difficulty, currentLevel: levelId(selected) });
          setLevel(selected);
        }}
      />
    );
  }

  return <GameScreen song={song} level={level} mode={mode} />;
}
