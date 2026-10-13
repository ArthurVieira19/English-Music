import { getSupabase } from "@/services/supabase/client"
import { isMissingFunction } from "@/services/supabase/rpcErrors"
import {
  SONG_BOARD_SIZE,
  parseSongScoreRows,
  parseSubmissionRow,
  type SongScoreEntry,
  type SongScoreSubmission,
} from "@/modules/leaderboard/songScores"

export interface SongScorePayload {
  difficulty: string
  mode: string
  score: number
  blanks: number
  correctAnswers: number
  playTimeMs: number
}

/**
 * - not-set-up: supabase/migrations/20261013120000_song_scores.sql hasn't been run yet
 * - unavailable: anything else — offline, server error, signed out
 */
export type SongBoardResult =
  | { ok: true; entries: SongScoreEntry[] }
  | { ok: false; reason: "not-set-up" | "unavailable" }

/**
 * The per-song ranking. Every call is best-effort: a failure here must never
 * get in the way of playing, so nothing throws and callers treat `null` /
 * `ok: false` as "this score just isn't ranked".
 */
export const songScoreService = {
  /**
   * Asks the server for a one-use "play pass" when a game starts. The server
   * stamps the start on its own clock, which is what lets it later judge
   * whether a finished game's play time is believable.
   */
  async startPlay(songId: string): Promise<string | null> {
    try {
      const { data, error } = await getSupabase().rpc("start_song_play", { p_song_id: songId })
      if (error || typeof data !== "string") return null
      return data
    } catch (error) {
      console.warn("Could not start a ranked play.", error)
      return null
    }
  },

  /** Spends the play pass on a finished game. `null` when the score wasn't accepted. */
  async submit(playId: string, payload: SongScorePayload): Promise<SongScoreSubmission | null> {
    try {
      const { data, error } = await getSupabase().rpc("submit_song_score", {
        p_play_id: playId,
        p_difficulty: payload.difficulty,
        p_mode: payload.mode,
        p_score: Math.round(payload.score),
        p_blanks: payload.blanks,
        p_correct: payload.correctAnswers,
        p_play_time_ms: Math.round(payload.playTimeMs),
      })
      if (error) {
        console.warn("The server did not rank this score.", error.message)
        return null
      }
      return parseSubmissionRow(data)
    } catch (error) {
      console.warn("Could not submit the score.", error)
      return null
    }
  },

  async loadBoard(songId: string, difficulty: string, mode: string): Promise<SongBoardResult> {
    try {
      const { data, error } = await getSupabase().rpc("get_song_leaderboard", {
        p_song_id: songId,
        p_difficulty: difficulty,
        p_mode: mode,
        p_limit: SONG_BOARD_SIZE,
      })
      if (error) {
        return { ok: false, reason: isMissingFunction(error) ? "not-set-up" : "unavailable" }
      }
      return { ok: true, entries: parseSongScoreRows(data) }
    } catch (error) {
      console.warn("Could not load the song ranking.", error)
      return { ok: false, reason: "unavailable" }
    }
  },
}
