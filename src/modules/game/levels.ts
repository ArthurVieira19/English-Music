import type { Difficulty } from "@/types/Difficulty"

/**
 * Ten small steps instead of four big jumps: each difficulty tier (beginner,
 * intermediate, advanced) has three stages, and expert stands alone. A stage
 * is "how often a blank comes up", measured in seconds of music per blank, so
 * a fast rap verse and a slow ballad at the same level ask for the same
 * listening effort per second.
 *
 * The tier is still what scores are ranked by (see songScores) and what the
 * rest of the app calls "difficulty"; the stage only tunes blank density.
 */

export type Stage = 1 | 2 | 3

export interface Level {
  difficulty: Difficulty
  stage: Stage
}

export type LevelId =
  | "beginner-1"
  | "beginner-2"
  | "beginner-3"
  | "intermediate-1"
  | "intermediate-2"
  | "intermediate-3"
  | "advanced-1"
  | "advanced-2"
  | "advanced-3"
  | "expert-1"

/** Expert hides every eligible word, so it has a single stage. */
const STAGES: Record<Difficulty, Stage[]> = {
  beginner: [1, 2, 3],
  intermediate: [1, 2, 3],
  advanced: [1, 2, 3],
  expert: [1],
}

const DIFFICULTY_ORDER: Difficulty[] = ["beginner", "intermediate", "advanced", "expert"]

/** Every level, easiest first. */
export const LEVELS: Level[] = DIFFICULTY_ORDER.flatMap((difficulty) =>
  STAGES[difficulty].map((stage) => ({ difficulty, stage })),
)

/**
 * Seconds of singing per blank. 0 means "every eligible word" (expert).
 * Songs run at roughly 2-3 words a second, so the ladder goes from about one
 * word in twelve (beginner 1) to well over a third of them (advanced 3).
 */
const SECONDS_PER_BLANK: Record<LevelId, number> = {
  "beginner-1": 5,
  "beginner-2": 4,
  "beginner-3": 3.2,
  "intermediate-1": 2.6,
  "intermediate-2": 2.2,
  "intermediate-3": 1.8,
  "advanced-1": 1.5,
  "advanced-2": 1.2,
  "advanced-3": 1,
  "expert-1": 0,
}

/** Stars a run needs, at the player's own level, to move them up a step. */
export const PROMOTION_STARS = 4

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
}

export function levelId(level: Level): LevelId {
  return `${level.difficulty}-${level.stage}` as LevelId
}

export function parseLevelId(id: string | null | undefined): Level | null {
  if (!id) return null
  return LEVELS.find((level) => levelId(level) === id) ?? null
}

function levelIndex(level: Level): number {
  return LEVELS.findIndex((candidate) => levelId(candidate) === levelId(level))
}

export function levelLabel(level: Level): string {
  const name = DIFFICULTY_LABELS[level.difficulty]
  return STAGES[level.difficulty].length > 1 ? `${name} ${level.stage}` : name
}

export function secondsPerBlank(level: Level): number {
  return SECONDS_PER_BLANK[levelId(level)]
}

/** Expert hides every word the engine considers fair game, and only accepts typing. */
export function hidesEveryWord(level: Level): boolean {
  return secondsPerBlank(level) === 0
}

export function nextLevel(level: Level): Level | null {
  const index = levelIndex(level)
  return index >= 0 && index < LEVELS.length - 1 ? LEVELS[index + 1] : null
}

/** First stage of a tier — the level a player lands on when picking a tier for the first time. */
export function firstLevelOf(difficulty: Difficulty): Level {
  return { difficulty, stage: STAGES[difficulty][0] }
}

/**
 * The level the player is at: the one saved on their account, else stage 1
 * of the tier they last chose (accounts from before levels had stages).
 */
export function resolveCurrentLevel(savedLevelId: string | null | undefined, fallback: Difficulty): Level {
  return parseLevelId(savedLevelId) ?? firstLevelOf(fallback)
}

/**
 * Which stage of each tier to offer on the setup screen: the player's own
 * stage in their tier, the top stage of easier tiers (closest to where they
 * are), and the first stage of harder ones.
 */
export function offeredLevel(difficulty: Difficulty, current: Level): Level {
  const tier = DIFFICULTY_ORDER.indexOf(difficulty)
  const currentTier = DIFFICULTY_ORDER.indexOf(current.difficulty)
  if (tier === currentTier) return current

  const stages = STAGES[difficulty]
  return { difficulty, stage: tier < currentTier ? stages[stages.length - 1] : stages[0] }
}

/**
 * Where a finished run moves the player. Only a strong run (enough stars) at
 * or above their current level counts, and it only ever moves them up: a bad
 * day on a hard song shouldn't knock anyone back down. Null means no change.
 */
export function promotionAfter(played: Level, current: Level, stars: number): Level | null {
  if (stars < PROMOTION_STARS) return null
  if (levelIndex(played) < levelIndex(current)) return null

  const next = nextLevel(played)
  return next && levelIndex(next) > levelIndex(current) ? next : null
}
