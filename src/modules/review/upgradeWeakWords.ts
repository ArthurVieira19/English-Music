import type { Song } from "@/types/Song"
import type { WeakWord } from "@/types/WeakWord"
import { findSong } from "@/data/songs"
import { findClipForWord, isValidClip } from "./reviewClip"
import { weakWordKey } from "./weakWordKey"

/**
 * Two entries for the same word in the same line of a song are one thing to
 * relearn. Keeps the schedule of the one seen last and adds up the history.
 */
export function mergeWeakWords(a: WeakWord, b: WeakWord): WeakWord {
  const [newer, older] = a.lastSeenAt >= b.lastSeenAt ? [a, b] : [b, a]
  return {
    ...newer,
    clip: newer.clip ?? older.clip,
    timesWrong: a.timesWrong + b.timesWrong,
    timesCorrect: a.timesCorrect + b.timesCorrect,
  }
}

/**
 * Brings words saved before clips existed up to date: each gets the line of
 * the song it was missed in (narrowed from the chunk the game used to save) and
 * the time that line is sung. Words whose song or line can't be found are left
 * as they were. Pinning a word to a line can make two entries the same, which
 * are then merged.
 *
 * Returns `null` when nothing changed, so the caller has nothing to save.
 */
export function upgradeWeakWords(weakWords: WeakWord[], songs: Song[]): WeakWord[] | null {
  let changed = false

  const upgraded = weakWords.map((weak) => {
    if (isValidClip(weak.clip)) return weak

    const song = findSong(weak.songId, songs)
    const found = song ? findClipForWord(song.lyrics, weak.contextText, weak.word) : null
    if (!found) return weak

    changed = true
    return { ...weak, contextText: found.contextText, clip: found.clip }
  })

  if (!changed) return null

  const byKey = new Map<string, WeakWord>()
  for (const weak of upgraded) {
    const key = weakWordKey(weak)
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergeWeakWords(existing, weak) : weak)
  }
  return [...byKey.values()]
}
