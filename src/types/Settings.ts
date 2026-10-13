import type { Difficulty } from "./Difficulty"
import type { GameMode } from "./GameMode"

export interface Settings {
  volume: number
  defaultDifficulty: Difficulty
  defaultGameMode: GameMode
  fuzzyMatching: boolean
  theme: "dark" | "light" | "system"
  /**
   * Per-song lyric sync correction in seconds, keyed by song id (see
   * modules/game/syncOffset.ts). Absent for songs that were never adjusted,
   * and optional so settings saved before this existed still load.
   */
  songOffsets?: Record<string, number>
  /**
   * The level the player is at, as a LevelId (see modules/game/levels.ts).
   * Absent on accounts from before levels had stages: stage 1 of
   * `defaultDifficulty` stands in.
   */
  currentLevel?: string
}
