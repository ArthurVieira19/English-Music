"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { ExerciseLine } from "@/types/ExerciseLine"
import {
  WORD_BANK_SIZE,
  arrangeBankSlots,
  bankTarget,
  initialBankSlots,
  upcomingBankWords,
} from "@/modules/game/wordBank"
import { answeredTokenKey } from "@/stores/gameStore"
import { cn } from "@/lib/utils"

const NO_WRONG_GUESSES: Record<string, string[]> = {}

/**
 * The word bank (word-bank mode): one shared set of buttons holding the next
 * few words the song will ask for. A pick answers the first open blank of the
 * current line, so the player has to hear which of the upcoming words is
 * being sung right now. Words keep their button until they're used up.
 */
export function WordBank({
  exercises,
  lineIndex,
  answeredTokens,
  wrongGuesses = NO_WRONG_GUESSES,
  seed,
  onPick,
}: {
  exercises: ExerciseLine[]
  /** The line picks answer: the active one (or the one the song is paused on). */
  lineIndex: number
  answeredTokens: Record<string, boolean>
  wrongGuesses?: Record<string, string[]>
  /** Shuffles the first layout, so buttons don't read out the song's order. */
  seed: number
  onPick: (tokenIndex: number, word: string) => void
}) {
  const words = upcomingBankWords(exercises, answeredTokens, lineIndex)
  const wordList = words.map((w) => w.word)
  const wordsKey = wordList.join("|")

  // Slots depend on the previous layout (words keep their button), so they
  // live in state and are updated during render when the words change —
  // React's pattern for state derived from a previous render.
  const [layout, setLayout] = useState(() => ({ key: wordsKey, slots: initialBankSlots(wordList, seed) }))
  let slots = layout.slots
  if (layout.key !== wordsKey) {
    const wasEmpty = layout.slots.every((slot) => slot === null)
    slots = wasEmpty ? initialBankSlots(wordList, seed) : arrangeBankSlots(layout.slots, wordList)
    setLayout({ key: wordsKey, slots })
  }

  if (words.length === 0) return null

  const target = bankTarget(exercises, answeredTokens, lineIndex)
  const ruledOut = target
    ? (wrongGuesses[answeredTokenKey(target.exerciseIndex, target.tokenIndex)] ?? []).map((g) => g.toLowerCase())
    : []
  const countOf = new Map(words.map((w) => [w.word, w.count]))

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
        {target ? "Which of these is being sung now?" : "Coming up next…"}
      </p>
      <div role="group" aria-label="Word bank" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {Array.from({ length: WORD_BANK_SIZE }, (_, index) => {
          const word = slots[index] ?? null
          if (!word) {
            return <div key={`empty-${index}`} aria-hidden className="min-h-12 rounded-xl border border-dashed border-border/50" />
          }

          const count = countOf.get(word) ?? 1
          const isRuledOut = ruledOut.includes(word)
          return (
            <motion.button
              key={`slot-${index}`}
              type="button"
              whileTap={{ scale: 0.96 }}
              disabled={!target || isRuledOut}
              aria-label={count > 1 ? `${word}, needed ${count} times` : word}
              onClick={() => target && onPick(target.tokenIndex, word)}
              className={cn(
                "relative min-h-12 truncate rounded-xl border border-border bg-accent/60 px-4 font-body text-base font-medium transition-colors duration-150",
                "enabled:hover:border-secondary/50 enabled:hover:bg-secondary/10 enabled:hover:text-secondary",
                isRuledOut ? "text-destructive/60 line-through opacity-50" : "disabled:opacity-50",
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-block"
                >
                  {word}
                </motion.span>
              </AnimatePresence>
              {count > 1 && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1.5 rounded-full bg-foreground/10 px-1.5 text-xs text-muted-foreground tabular-nums"
                >
                  ×{count}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
