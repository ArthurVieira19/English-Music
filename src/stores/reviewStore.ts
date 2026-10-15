import { create } from "zustand"
import type { Song } from "@/types/Song"
import type { WeakWord, WeakWordContext, WeakWordRef } from "@/types/WeakWord"
import { applyCorrect, applyMiss, getDueWords } from "@/modules/review/spacedRepetition"
import { upgradeWeakWords } from "@/modules/review/upgradeWeakWords"
import { weakWordKey } from "@/modules/review/weakWordKey"
import { storageService } from "@/services/storage/storageService"
import { useStatsStore } from "@/stores/statsStore"

interface ReviewState {
  weakWords: WeakWord[]
}

interface ReviewActions {
  loadFromStorage: () => void
  /**
   * Records a missed answer. A word is tracked per line of a song (see
   * weakWordKey): a new place creates an entry, and missing the same place
   * again resets that entry back to the shortest interval.
   */
  recordMiss: (word: string, context: WeakWordContext, now?: number) => void
  /**
   * Records a correct answer for a word already being tracked in that line of
   * that song. A no-op for anything never missed — only entries already in the
   * weak-word pool gain review progress this way. Returns `true` when this
   * answer cleared the entry's whole review ladder (it's now mastered and left
   * the pool).
   */
  recordCorrect: (ref: WeakWordRef, now?: number) => boolean
  /** Drops an entry from the pool outright — e.g. a proper noun or false positive the player wants to stop seeing. */
  removeWord: (ref: WeakWordRef) => void
  /** Pins words saved before clips existed to the line of the song they were missed in, once the library is available. */
  upgradeLegacy: (songs: Song[]) => void
  dueWords: (now?: number) => WeakWord[]
}

export const useReviewStore = create<ReviewState & ReviewActions>((set, get) => ({
  weakWords: [],

  loadFromStorage: () => set({ weakWords: storageService.getWeakWords() }),

  recordMiss: (word, context, now = Date.now()) => {
    const weakWords = get().weakWords
    const key = weakWordKey({ word, songId: context.songId, contextText: context.contextText })
    const existing = weakWords.find((w) => weakWordKey(w) === key)
    const updated = applyMiss(existing, word, context, now)

    const next = existing ? weakWords.map((w) => (w === existing ? updated : w)) : [...weakWords, updated]

    storageService.saveWeakWords(next)
    set({ weakWords: next })
  },

  recordCorrect: (ref, now = Date.now()) => {
    const weakWords = get().weakWords
    const key = weakWordKey(ref)
    const existing = weakWords.find((w) => weakWordKey(w) === key)
    if (!existing) return false

    const updated = applyCorrect(existing, now)
    const mastered = updated === null

    const next = updated ? weakWords.map((w) => (w === existing ? updated : w)) : weakWords.filter((w) => w !== existing)

    storageService.saveWeakWords(next)
    set({ weakWords: next })

    // "Words mastered" counts words, not places: it ticks once the last line
    // where the word was a problem has been cleared.
    if (mastered && !next.some((w) => w.word === existing.word)) useStatsStore.getState().incrementWordsMastered()
    return mastered
  },

  removeWord: (ref) => {
    const key = weakWordKey(ref)
    const next = get().weakWords.filter((w) => weakWordKey(w) !== key)
    storageService.saveWeakWords(next)
    set({ weakWords: next })
  },

  upgradeLegacy: (songs) => {
    const next = upgradeWeakWords(get().weakWords, songs)
    if (!next) return
    storageService.saveWeakWords(next)
    set({ weakWords: next })
  },

  dueWords: (now = Date.now()) => getDueWords(get().weakWords, now),
}))
