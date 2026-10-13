export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt: number | null
}

export interface GameResult {
  songId: string
  score: number
  accuracy: number
  combo: number
  maxCombo: number
  correctAnswers: number
  totalAnswers: number
  playTimeMs: number
  difficulty: string
  /** The answer mode actually played (expert always types). Absent on results saved before per-song ranking. */
  mode?: string
  /** How many blanks the song had. */
  blanks?: number
  /** 0-5 in half-star steps, relative to the song's own par score. */
  stars?: number
  /** The level played, as a LevelId ("intermediate-2"). */
  level?: string
  /** Set when this run moved the player up to a new level (a LevelId). */
  levelUp?: string
}
