import type { ExerciseLine } from "@/types/ExerciseLine"

/**
 * Word-bank mode: instead of four options for one blank (three of them random
 * words that are often obviously wrong), the player gets a shared bank of the
 * *next* few words the song is about to ask for, in no particular order. Every
 * option is a real upcoming answer, so the only way to pick the right one is
 * to hear which of them is being sung now.
 */

/** Buttons in the bank. Enough to make guessing pointless, few enough to scan mid-song. */
export const WORD_BANK_SIZE = 6

export interface BankWord {
  /** Lowercase, so a capital letter can't give away the line's first word. */
  word: string
  /** How many of the upcoming blanks this word answers. */
  count: number
}

export interface BankTarget {
  exerciseIndex: number
  tokenIndex: number
}

function isOpen(answeredTokens: Record<string, boolean>, exerciseIndex: number, tokenIndex: number): boolean {
  return !(`${exerciseIndex}:${tokenIndex}` in answeredTokens)
}

/** The blank a pick answers: the first open one on the given line, in reading order. */
export function bankTarget(
  exercises: ExerciseLine[],
  answeredTokens: Record<string, boolean>,
  lineIndex: number,
): BankTarget | null {
  const line = exercises[lineIndex]
  if (!line) return null

  const token = line.tokens.find((t) => t.isHidden && t.answer && isOpen(answeredTokens, lineIndex, t.index))
  return token ? { exerciseIndex: lineIndex, tokenIndex: token.index } : null
}

/**
 * The words the bank should offer: the answers of the open blanks from
 * `fromLine` onward, in song order, until `size` different words are found.
 * A word needed more than once in that stretch is offered once, with a count.
 */
export function upcomingBankWords(
  exercises: ExerciseLine[],
  answeredTokens: Record<string, boolean>,
  fromLine: number,
  size = WORD_BANK_SIZE,
): BankWord[] {
  const words: BankWord[] = []
  const byWord = new Map<string, BankWord>()

  for (let lineIndex = Math.max(0, fromLine); lineIndex < exercises.length; lineIndex++) {
    for (const token of exercises[lineIndex].tokens) {
      if (!token.isHidden || !token.answer || !isOpen(answeredTokens, lineIndex, token.index)) continue

      const word = token.answer.toLowerCase()
      const existing = byWord.get(word)
      if (existing) {
        existing.count++
        continue
      }
      // The bank is full: stop at the first word that wouldn't fit, so counts
      // only cover the stretch of song the bank is actually showing.
      if (words.length >= size) return words

      const entry = { word, count: 1 }
      byWord.set(word, entry)
      words.push(entry)
    }
  }

  return words
}

/**
 * Lays the words out on the bank's buttons. Words already showing keep their
 * button, so the player's eye can learn where things are; a used-up word
 * frees its button, and new words fill free buttons in order. Without this
 * every answer would reshuffle the whole bank under the player's thumb.
 */
export function arrangeBankSlots(previous: (string | null)[], words: string[], size = WORD_BANK_SIZE): (string | null)[] {
  const wanted = new Set(words)
  const slots: (string | null)[] = Array.from({ length: size }, (_, i) => {
    const word = previous[i] ?? null
    return word !== null && wanted.has(word) ? word : null
  })

  const placed = new Set(slots.filter((word): word is string => word !== null))
  for (const word of words) {
    if (placed.has(word)) continue
    const free = slots.indexOf(null)
    if (free < 0) break
    slots[free] = word
    placed.add(word)
  }

  return slots
}

/**
 * The first layout of a fresh bank: the words shuffled by a seed, so the
 * button order doesn't simply read out the song's order of blanks.
 */
export function initialBankSlots(words: string[], seed: number, size = WORD_BANK_SIZE): (string | null)[] {
  const shuffled = [...words]
  let state = seed | 0
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Small LCG: deterministic and good enough to scatter six words.
    state = (Math.imul(state, 1664525) + 1013904223) | 0
    const j = (state >>> 0) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return arrangeBankSlots([], shuffled, size)
}
