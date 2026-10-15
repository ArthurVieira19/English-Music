import type { Song } from "@/types/Song"
import type { WeakWord, WeakWordClip } from "@/types/WeakWord"
import { findSong } from "@/data/songs"
import { buildReviewCard } from "./reviewCard"
import { findClipForWord, isValidClip } from "./reviewClip"

/** The moment of the video a card replays. */
export interface ReviewVideo {
  youtubeId: string
  clip: WeakWordClip
}

/** One card of a review session: a lyric line, the words missed in it, and the video of it when there is one. */
export interface ReviewItem {
  key: string
  songId: string
  songTitle: string
  artist: string
  contextText: string
  /** The weak words hidden on this card, in the order they were queued. */
  words: WeakWord[]
  /** `null` when the song isn't in the library any more or the moment can't be found: the card is then text only. */
  video: ReviewVideo | null
}

interface Located {
  contextText: string
  clip: WeakWordClip | null
}

function locate(weakWord: WeakWord, song: Song | undefined): Located {
  if (isValidClip(weakWord.clip)) return { contextText: weakWord.contextText, clip: weakWord.clip }

  // Saved before clips were recorded: find the line again in the song's lyrics.
  const found = song ? findClipForWord(song.lyrics, weakWord.contextText, weakWord.word) : null
  return found ?? { contextText: weakWord.contextText, clip: null }
}

/**
 * Turns the words due for review into cards. Words missed in the same line of
 * the same song share one card (one clip to hear, one go at all its blanks)
 * instead of playing the same moment twice in a row.
 */
export function buildReviewItems(weakWords: WeakWord[], songs: Song[]): ReviewItem[] {
  const items = new Map<string, ReviewItem>()

  for (const weakWord of weakWords) {
    const song = findSong(weakWord.songId, songs)
    const { contextText, clip } = locate(weakWord, song)

    // A word that can't be found in its line has nothing to blank; it gets a card of its own.
    const hasBlank = buildReviewCard(contextText, weakWord.word).blankIndices.size > 0
    const place = clip ? `@${clip.start}` : `|${contextText}`
    const key = `${weakWord.songId}${place}${hasBlank ? "" : `|${weakWord.word}`}`

    const existing = items.get(key)
    if (existing) {
      existing.words.push(weakWord)
      continue
    }

    items.set(key, {
      key,
      songId: weakWord.songId,
      songTitle: weakWord.songTitle,
      artist: weakWord.artist,
      contextText,
      words: [weakWord],
      video: clip && song?.youtubeId ? { youtubeId: song.youtubeId, clip } : null,
    })
  }

  return [...items.values()]
}
