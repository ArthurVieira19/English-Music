/**
 * Guesses a song's title and artist from a YouTube video title (and channel
 * name), so adding a song can start from just a pasted link. Music video
 * titles mostly follow "Artist - Title (Official Video)", with a long tail of
 * variations; anything this can't untangle is left for the admin to fix, so
 * it aims to be right often, not always.
 */

export interface VideoTitleGuess {
  title: string
  /** Empty when neither the video title nor the channel says who the artist is. */
  artist: string
}

/** Words that mark a bracketed group as packaging rather than part of the song's name. */
const NOISE_WORDS =
  /\b(official|video|audio|lyrics?|visuali[sz]er|remaster(ed)?|hd|hq|4k|8k|mv|m\/v|clip|explicit|clean|color coded|live|performance|version|letra|legendado|tradu[cç][aã]o|karaoke|sped up|slowed|reverb|full song|music)\b/i

/** "(Official Video)", "[4K Remaster]", "【MV】": a bracketed group made of noise. */
const BRACKETED = /\s*[([【]([^)\]】]*)[)\]】]/g

/** "feat. X", "ft. X", "featuring X", with or without brackets, up to the next bracket or separator. */
const FEATURING = /\s*[([]?\s*\b(feat\.?|ft\.?|featuring)\s+[^)\]|–—-]*[)\]]?/gi

/** Dash-like separators between artist and title. A plain hyphen only counts with spaces around it. */
const ARTIST_TITLE_SEPARATOR = /\s+[-–—~]\s+/

function stripNoise(text: string): string {
  return text
    .replace(BRACKETED, (group, inner: string) => (NOISE_WORDS.test(inner) ? "" : group))
    .replace(FEATURING, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function unquote(text: string): string {
  return text.replace(/^["'“‘«]+|["'”’»]+$/g, "").trim()
}

/** Turns a channel name into an artist name: drops "- Topic", "VEVO", "Official", splits "TaylorSwift". */
export function artistFromChannel(channel: string): string {
  let name = channel
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\b(official|music|channel)\b/gi, "")
    .trim()

  if (!/\s/.test(name)) name = name.replace(/([a-z])([A-Z])/g, "$1 $2")
  return name.replace(/\s{2,}/g, " ").trim()
}

export function parseVideoTitle(videoTitle: string, channel = ""): VideoTitleGuess {
  // Anything after a "|" or "//" is almost always channel branding or a tagline.
  const main = videoTitle.split(/\s+(?:\||\/\/)\s+/)[0]

  const separated = main.split(ARTIST_TITLE_SEPARATOR)
  if (separated.length >= 2) {
    const [artistPart, ...titleParts] = separated
    return {
      artist: unquote(stripNoise(artistPart)),
      title: unquote(stripNoise(titleParts.join(" - "))),
    }
  }

  // Artist "Title" — a quoted title after the artist's name.
  const quoted = main.match(/^(.+?)\s+["“](.+?)["”]/)
  if (quoted) {
    return { artist: stripNoise(quoted[1]), title: stripNoise(quoted[2]) }
  }

  return { title: unquote(stripNoise(main)), artist: artistFromChannel(channel) }
}

/**
 * A YouTube search for the song's official audio upload. That upload is the
 * album recording, the one synced lyrics are timed against, so its timing
 * lines up; music videos often add an intro or a scene and drift.
 */
export function youtubeSearchUrl(title: string, artist: string): string {
  const query = [artist, title, "official audio"].map((part) => part.trim()).filter(Boolean).join(" ")
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}
