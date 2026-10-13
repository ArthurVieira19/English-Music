const BASE_SCORE = 100
const MAX_SPEED_BONUS = 50
const COMBO_BONUS_PER_STREAK = 10
/**
 * The combo bonus stops growing after this many answers in a row. Without a
 * ceiling it grows linearly forever, so a flawless long song would score
 * quadratically more than a flawless short one and the ranking would reward
 * song length, not listening. The server-side ceiling in
 * supabase/migrations/20261013120000_song_scores.sql mirrors this value.
 */
export const COMBO_STREAK_CAP = 10

/** How many guesses a player gets for each blank before it is revealed as a miss. */
export const MAX_ATTEMPTS = 2
/** Share of the points a correct answer keeps when it took more than one attempt. */
const RETRY_POINTS_MULTIPLIER = 0.5

export interface ScoreAnswerInput {
  isCorrect: boolean
  /** How long the player took to answer, in milliseconds. */
  responseTimeMs: number
  /** Time budget for this exercise, in milliseconds. */
  timeLimitMs: number
  /** Combo count going into this answer (before it is applied). */
  combo: number
  /** Which guess this is for the blank, starting at 1. A correct answer on attempt 2+ earns half the points. */
  attempt?: number
}

export interface ScoreAnswerResult {
  points: number
  baseScore: number
  speedBonus: number
  comboBonus: number
  newCombo: number
}

/** Faster correct answers earn more, linearly, up to MAX_SPEED_BONUS. */
export function calculateSpeedBonus(responseTimeMs: number, timeLimitMs: number): number {
  if (timeLimitMs <= 0) return 0

  const remainingRatio = 1 - responseTimeMs / timeLimitMs
  const clamped = Math.max(0, Math.min(1, remainingRatio))

  return Math.round(clamped * MAX_SPEED_BONUS)
}

export function calculateComboBonus(combo: number): number {
  return Math.min(Math.max(0, combo), COMBO_STREAK_CAP) * COMBO_BONUS_PER_STREAK
}

/** Sum of the combo bonuses of a run that answers `blanks` blanks in a row without a miss. */
function flawlessComboBonusTotal(blanks: number): number {
  let total = 0
  for (let streak = 1; streak <= blanks; streak++) total += calculateComboBonus(streak)
  return total
}

/**
 * The most a single blank can ever pay: first try, instantly, combo at its
 * ceiling. Redoing a line after jumping back to it can put a player at the
 * combo ceiling from the first blank, so this per-blank bound — not the
 * slower ramp-up of a first playthrough — is the true upper limit.
 */
export const MAX_POINTS_PER_BLANK = BASE_SCORE + MAX_SPEED_BONUS + COMBO_STREAK_CAP * COMBO_BONUS_PER_STREAK

/**
 * The most a song with `blanks` blanks can ever pay. Nothing a real player
 * does can beat it, so the server rejects any submitted score above it.
 */
export function calculateMaxScore(blanks: number): number {
  if (blanks <= 0) return 0
  return blanks * MAX_POINTS_PER_BLANK
}

/**
 * The benchmark for a "perfect" run: flawless, answering at an average pace
 * (half the speed bonus). Stars are measured against this rather than the
 * theoretical ceiling, which would put five stars out of any human's reach.
 */
export function calculateParScore(blanks: number): number {
  if (blanks <= 0) return 0
  return blanks * (BASE_SCORE + MAX_SPEED_BONUS / 2) + flawlessComboBonusTotal(blanks)
}

export const MAX_STARS = 5

/**
 * Star rating from 0 to 5 in half-star steps, relative to the song's own par
 * score — so a short song and a long one are rated on the same scale and
 * scores can be compared across songs.
 */
export function calculateStars(score: number, blanks: number): number {
  const par = calculateParScore(blanks)
  if (par <= 0 || score <= 0) return 0
  return Math.min(MAX_STARS, Math.floor((score / par) * MAX_STARS * 2) / 2)
}

/**
 * Pure scoring function: baseScore + speedBonus + comboBonus, or a reset
 * combo on a miss. A correct answer that needed a second attempt keeps only
 * half of each part (the combo itself still continues).
 */
export function scoreAnswer(input: ScoreAnswerInput): ScoreAnswerResult {
  if (!input.isCorrect) {
    return { points: 0, baseScore: 0, speedBonus: 0, comboBonus: 0, newCombo: 0 }
  }

  const newCombo = input.combo + 1
  const multiplier = (input.attempt ?? 1) > 1 ? RETRY_POINTS_MULTIPLIER : 1
  const baseScore = Math.round(BASE_SCORE * multiplier)
  const speedBonus = Math.round(calculateSpeedBonus(input.responseTimeMs, input.timeLimitMs) * multiplier)
  const comboBonus = Math.round(calculateComboBonus(newCombo) * multiplier)

  return { points: baseScore + speedBonus + comboBonus, baseScore, speedBonus, comboBonus, newCombo }
}

/** Percentage (0-100, 2 decimals) of correct answers out of all answers given. */
export function calculateAccuracy(correctAnswers: number, totalAnswers: number): number {
  if (totalAnswers <= 0) return 0
  return Math.round((correctAnswers / totalAnswers) * 10000) / 100
}

/** Percentage (0-100, 2 decimals) of exercises answered out of the total in a song. */
export function calculateCompletion(answeredExercises: number, totalExercises: number): number {
  if (totalExercises <= 0) return 0
  return Math.round((answeredExercises / totalExercises) * 10000) / 100
}
