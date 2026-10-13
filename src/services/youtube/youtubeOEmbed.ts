const OEMBED_URL = "https://www.youtube.com/oembed"

export interface YoutubeVideoInfo {
  /** The video's title as shown on YouTube, e.g. "Adele - Hello (Official Music Video)". */
  title: string
  /** The uploading channel's name. */
  channel: string
}

/**
 * - not-found: no such video (deleted, or a mistyped id)
 * - restricted: private, or the owner doesn't allow it to play outside YouTube — it won't play in the game either
 * - unavailable: anything else (offline, YouTube down)
 */
export type YoutubeVideoLookup =
  | { ok: true; info: YoutubeVideoInfo }
  | { ok: false; reason: "not-found" | "restricted" | "unavailable" }

/**
 * Reads a video's title and channel through YouTube's oEmbed endpoint, which
 * needs no API key and answers browsers directly (CORS), so it works from this
 * static site with no backend.
 */
export async function lookupYoutubeVideo(videoId: string): Promise<YoutubeVideoLookup> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  try {
    const response = await fetch(`${OEMBED_URL}?url=${encodeURIComponent(watchUrl)}&format=json`)
    if (response.status === 404 || response.status === 400) return { ok: false, reason: "not-found" }
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "restricted" }
    if (!response.ok) return { ok: false, reason: "unavailable" }

    const data = (await response.json()) as { title?: unknown; author_name?: unknown }
    if (typeof data.title !== "string") return { ok: false, reason: "unavailable" }

    return {
      ok: true,
      info: { title: data.title, channel: typeof data.author_name === "string" ? data.author_name : "" },
    }
  } catch {
    return { ok: false, reason: "unavailable" }
  }
}
