import { extractCoreWord } from "@/modules/game/exerciseGenerator"

export interface ReviewCard {
  /** The context line split into display tokens, punctuation intact. */
  tokens: string[]
  /** Every token index that must be hidden because it *is* a word under review. */
  blankIndices: Set<number>
  /** Which reviewed word (lowercase) each blank stands for. */
  blankWords: Map<number, string>
}

/**
 * Prepares a weak word's stored lyric line for display as a fill-in-the-blank
 * card. Every occurrence of a word is blanked, not just the first: context
 * lines can repeat a hook like "I love you baby and I love you always", which
 * would otherwise print the answer two words after the blank. A line with
 * several missed words hides all of them.
 */
export function buildReviewCard(contextText: string, words: string | readonly string[]): ReviewCard {
  const targets = (typeof words === "string" ? [words] : words).map((word) => word.toLowerCase())
  const tokens = contextText.split(/\s+/).filter((token) => token.length > 0)
  const blankIndices = new Set<number>()
  const blankWords = new Map<number, string>()

  tokens.forEach((token, index) => {
    const core = extractCoreWord(token).toLowerCase()
    if (targets.includes(core)) {
      blankIndices.add(index)
      blankWords.set(index, core)
    }
  })

  return { tokens, blankIndices, blankWords }
}
