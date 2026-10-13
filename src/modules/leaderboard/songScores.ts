import type { Difficulty } from "@/types/Difficulty"
import type { GameMode } from "@/types/GameMode"

/** How many players the per-song ranking shows; the caller's own row is added when they're below it. */
export const SONG_BOARD_SIZE = 10

export interface SongScoreEntry {
  place: number
  userId: string
  displayName: string
  level: number
  score: number
  /** Percentage of blanks answered correctly in the run that set this score. */
  accuracy: number
  isMe: boolean
}

/** What the server says about a score the player just submitted. */
export interface SongScoreSubmission {
  /** The player's place on this song's board (among visible players), best score only. */
  place: number
  /** The player's best score on this board — the submitted one, or an earlier higher one. */
  bestScore: number
  isNewBest: boolean
}

/**
 * Where the just-finished game's score submission stands, read by the Results
 * page. `skipped` covers every reason it didn't count (offline, the SQL isn't
 * set up, the server judged it implausible) — the player shouldn't be shown
 * an error for a ranking they never knew they were entering.
 */
export type ScoreSubmissionState =
  | { status: "pending" }
  | { status: "saved"; submission: SongScoreSubmission }
  | { status: "skipped" }

/**
 * Expert hides every word and forces typing whatever mode was picked, so the
 * mode that decides which board a score belongs on is the one actually played.
 */
export function effectiveScoreMode(difficulty: Difficulty, mode: GameMode): GameMode {
  return difficulty === "expert" ? "typing" : mode
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Turns the raw rows of `get_song_leaderboard` into entries. Defensive on
 * purpose: Postgres bigints and numerics can arrive as strings, and a
 * malformed row should be dropped, not crash the page.
 */
export function parseSongScoreRows(rows: unknown): SongScoreEntry[] {
  if (!Array.isArray(rows)) return []

  const entries: SongScoreEntry[] = []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>

    const place = asFiniteNumber(r.place)
    const score = asFiniteNumber(r.score)
    if (typeof r.user_id !== "string" || place === null || score === null) continue

    const level = asFiniteNumber(r.level)
    const accuracy = asFiniteNumber(r.accuracy)

    entries.push({
      place,
      userId: r.user_id,
      displayName: typeof r.display_name === "string" && r.display_name.trim() ? r.display_name : "Player",
      level: level !== null && level > 0 ? level : 1,
      score,
      accuracy: accuracy !== null ? Math.min(100, Math.max(0, accuracy)) : 0,
      isMe: r.is_me === true,
    })
  }
  return entries
}

/**
 * Reads the single row `submit_song_score` returns. PostgREST wraps a
 * TABLE-returning function in an array, but a bare object is accepted too.
 */
export function parseSubmissionRow(data: unknown): SongScoreSubmission | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>

  const place = asFiniteNumber(r.out_place)
  const bestScore = asFiniteNumber(r.out_best_score)
  if (place === null || bestScore === null) return null

  return { place, bestScore, isNewBest: r.out_is_new_best === true }
}

/** True for the caller's own row when it sits below the shown board — the card draws a gap before it. */
export function isBelowBoard(entry: SongScoreEntry, size = SONG_BOARD_SIZE): boolean {
  return entry.isMe && entry.place > size
}
