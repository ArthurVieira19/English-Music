import { getSupabase } from "@/services/supabase/client"
import { isMissingFunction } from "@/services/supabase/rpcErrors"
import {
  LEADERBOARD_TOP,
  parseLeaderboardRows,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "@/modules/leaderboard/leaderboard"

/**
 * - not-set-up: the leaderboard SQL (supabase/migrations) hasn't been run on this project yet
 * - unavailable: anything else — offline, server error, signed out
 */
export type LeaderboardResult =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; reason: "not-set-up" | "unavailable" }

export const leaderboardService = {
  async load(period: LeaderboardPeriod): Promise<LeaderboardResult> {
    try {
      const { data, error } = await getSupabase().rpc("get_leaderboard", {
        p_period: period === "weekly" ? "weekly" : "all_time",
        p_limit: LEADERBOARD_TOP,
      })
      if (error) {
        return { ok: false, reason: isMissingFunction(error) ? "not-set-up" : "unavailable" }
      }
      return { ok: true, entries: parseLeaderboardRows(data) }
    } catch (error) {
      console.warn("Could not load the leaderboard.", error)
      return { ok: false, reason: "unavailable" }
    }
  },

  /** Whether the player opted out of the ranking. `null` when it can't be known (offline, or the migration hasn't run). */
  async getHidden(userId: string): Promise<boolean | null> {
    try {
      const { data, error } = await getSupabase()
        .from("profiles")
        .select("hide_from_leaderboard")
        .eq("id", userId)
        .maybeSingle<{ hide_from_leaderboard: boolean }>()
      if (error || !data) return null
      return data.hide_from_leaderboard === true
    } catch {
      return null
    }
  },

  /** Resolves `true` when the choice was saved. */
  async setHidden(hidden: boolean): Promise<boolean> {
    try {
      const { error } = await getSupabase().rpc("set_leaderboard_hidden", { p_hidden: hidden })
      return !error
    } catch {
      return false
    }
  },
}
