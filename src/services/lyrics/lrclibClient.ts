const LRCLIB_SEARCH_URL = "https://lrclib.net/api/search"

export interface LrclibResult {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

async function search(params: Record<string, string>): Promise<LrclibResult[]> {
  const query = new URLSearchParams(params)
  const response = await fetch(`${LRCLIB_SEARCH_URL}?${query.toString()}`)

  if (!response.ok) {
    throw new Error(`lrclib search failed with status ${response.status}`)
  }

  const data = (await response.json()) as LrclibResult[]
  return data.filter((result) => Boolean(result.syncedLyrics))
}

/**
 * Searches lrclib.net's public, keyless API for synced (LRC) lyrics matching
 * a track and artist. Results without synced lyrics are filtered out since
 * this app only supports timestamped playback.
 *
 * lrclib's combined track+artist search is strict about the exact artist
 * string it has indexed — a perfectly reasonable artist name (translated,
 * reordered, multiple artists joined with "e"/"&"/"and" instead of however
 * it's stored) can turn up nothing even though the song exists. When that
 * happens, this falls back to a track-only search: the picker UI already
 * shows each result's artist and album, so the player can pick the right
 * match themselves instead of hitting a dead end.
 */
export async function searchSyncedLyrics(title: string, artist: string): Promise<LrclibResult[]> {
  // An unknown artist (a video title that only names the song) goes straight to the track-only search.
  if (!artist.trim()) return search({ track_name: title })

  const combined = await search({ track_name: title, artist_name: artist })
  if (combined.length > 0) return combined

  return search({ track_name: title })
}
