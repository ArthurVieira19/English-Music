/**
 * Orders lyrics search results by how well they match the song being added,
 * and says whether the best one is safe to pick without asking. lrclib often
 * returns several versions of a song (album, live, remaster, a cover with the
 * same name), so the top result of the raw search isn't always the one.
 */

export interface LyricsCandidate {
  trackName: string
  artistName: string
}

export type MatchConfidence = "exact" | "close" | "weak"

export interface RankedMatch<T extends LyricsCandidate> {
  result: T
  confidence: MatchConfidence
}

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

/**
 * Best match first. Title counts double the artist: a cover by someone else
 * is a different recording, but an artist written differently ("Beyoncé" vs
 * "Beyonce", "A & B" vs "A and B") is still the right song. Ties keep the
 * search's own order.
 */
export function rankLyricsMatches<T extends LyricsCandidate>(
  results: T[],
  wanted: { title: string; artist: string },
): RankedMatch<T>[] {
  const hasArtist = normalizeForMatch(wanted.artist).length > 0

  return results
    .map((result, index) => {
      const titleScore = similarity(result.trackName, wanted.title)
      const artistScore = hasArtist ? similarity(result.artistName, wanted.artist) : 0
      return {
        result,
        index,
        score: titleScore * 2 + artistScore,
        confidence: confidenceOf(titleScore, artistScore, hasArtist),
      }
    })
    .sort(
      (a, b) =>
        CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] || b.score - a.score || a.index - b.index,
    )
    .map(({ result, confidence }) => ({ result, confidence }))
}
