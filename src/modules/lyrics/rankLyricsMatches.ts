/**
 * Orders lyrics search results by how well they fit the song being added, and
 * says which one is safe to pick without asking.
 *
 * Synced lyrics are timed against one recording, usually the album version. A
 * YouTube upload of the same song is often a different cut: a music video with
 * an intro or a skit, a radio edit, a live take. The right *song* can still be
 * timed for the wrong *video*. The tell is length: lyrics timed for a recording
 * as long as the video almost always line up with it. So results are judged on
 * two things, identity (title and artist) and timing (length vs. the video).
 */

export interface LyricsCandidate {
  trackName: string
  artistName: string
  /** Length of the recording the lyrics were timed against, in seconds. */
  duration?: number
}

export type MatchConfidence = "exact" | "close" | "weak"

export interface RankedMatch<T extends LyricsCandidate> {
  result: T
  confidence: MatchConfidence
  /**
   * Recording length minus video length, in seconds (positive: the recording
   * is longer). Null when either length is unknown.
   */
  durationDelta: number | null
  /** True when the lengths agree closely enough for the timing to line up; null when unknown. */
  timingMatches: boolean | null
}

/**
 * How far apart two lengths may be and still count as the same cut. lrclib
 * matches on ±2s itself; a little more allows for YouTube rounding and a
 * second of silence at either end.
 */
export const DURATION_TOLERANCE_SECONDS = 3

/** Lowercase, no accents, no punctuation, no "feat. X", single spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([]?\s*\b(feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** 2 = same, 1 = one contains the other ("Hello" vs "Hello - Remastered"), else the share of shared words. */
function similarity(a: string, b: string): number {
  const x = normalizeForMatch(a)
  const y = normalizeForMatch(b)
  if (!x || !y) return 0
  if (x === y) return 2
  if (x.includes(y) || y.includes(x)) return 1

  const wordsX = new Set(x.split(" "))
  const wordsY = new Set(y.split(" "))
  let shared = 0
  for (const word of wordsX) if (wordsY.has(word)) shared++
  return shared / Math.max(wordsX.size, wordsY.size)
}

function confidenceOf(titleScore: number, artistScore: number, hasArtist: boolean): MatchConfidence {
  const artistOk = !hasArtist || artistScore >= 1
  if (titleScore === 2 && artistOk) return "exact"
  if (titleScore >= 1 && (artistOk || artistScore >= 0.5)) return "close"
  return "weak"
}

const CONFIDENCE_ORDER: Record<MatchConfidence, number> = { exact: 0, close: 1, weak: 2 }

function isKnownLength(seconds: number | null | undefined): seconds is number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
}

/**
 * Best fit first: the right song before the wrong one, then, among equally
 * right songs, the version whose length is closest to the video. Title counts
 * double the artist: a cover by someone else is a different recording, but an
 * artist written differently ("Beyoncé" vs "Beyonce") is the same song. Ties
 * keep the search's own order.
 */
export function rankLyricsMatches<T extends LyricsCandidate>(
  results: T[],
  wanted: { title: string; artist: string; videoDuration?: number | null },
): RankedMatch<T>[] {
  const hasArtist = normalizeForMatch(wanted.artist).length > 0
  const videoDuration = isKnownLength(wanted.videoDuration) ? wanted.videoDuration : null

  return results
    .map((result, index) => {
      const titleScore = similarity(result.trackName, wanted.title)
      const artistScore = hasArtist ? similarity(result.artistName, wanted.artist) : 0
      const durationDelta =
        videoDuration !== null && isKnownLength(result.duration) ? result.duration - videoDuration : null
      return {
        result,
        index,
        score: titleScore * 2 + artistScore,
        confidence: confidenceOf(titleScore, artistScore, hasArtist),
        durationDelta,
        timingMatches: durationDelta === null ? null : Math.abs(durationDelta) <= DURATION_TOLERANCE_SECONDS,
      }
    })
    .sort(
      (a, b) =>
        CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
        Math.abs(a.durationDelta ?? 0) - Math.abs(b.durationDelta ?? 0) ||
        b.score - a.score ||
        a.index - b.index,
    )
    .map(({ result, confidence, durationDelta, timingMatches }) => ({ result, confidence, durationDelta, timingMatches }))
}

/**
 * The match that can be filled in without asking: the right song (exact title
 * and artist) *and* timed for a recording as long as the video. Without the
 * video's length there is no such certainty, so nothing is picked.
 */
export function autoPick<T extends LyricsCandidate>(ranked: RankedMatch<T>[]): RankedMatch<T> | null {
  return ranked.find((match) => match.confidence === "exact" && match.timingMatches === true) ?? null
}
