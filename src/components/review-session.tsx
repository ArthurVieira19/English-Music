"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X } from "lucide-react"
import type { WeakWord } from "@/types/WeakWord"
import { validateAnswer } from "@/modules/game/answerValidator"
import { analyzeMistake, type MistakeInsight } from "@/modules/game/mistakeAnalyzer"
import { buildReviewCard } from "@/modules/review/reviewCard"
import { buildReviewItems } from "@/modules/review/reviewItems"
import { ReviewClipPlayer } from "@/components/review-clip-player"
import { useLibraryStore } from "@/stores/libraryStore"
import { useReviewStore } from "@/stores/reviewStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useStatsStore } from "@/stores/statsStore"
import { cn } from "@/lib/utils"

const XP_PER_CORRECT = 15
const XP_PER_MASTERED = 25
const ADVANCE_DELAY_MS = 1200

export interface ReviewSummary {
  totalReviewed: number
  correctCount: number
  masteredCount: number
  xpEarned: number
}

type WordResult = {
  isCorrect: boolean
  /** Why the guess was wrong, when it matches a known listening pattern. */
  insight: MistakeInsight | null
}

type Feedback = {
  /** Keyed by the reviewed word. */
  results: Record<string, WordResult>
  allCorrect: boolean
  /** A wrong answer waits for the player: to read an explanation, or to hear the line again with the answer on screen. */
  needsContinue: boolean
} | null

/**
 * Runs a spaced-repetition review session over a fixed snapshot of due words.
 * Each card is one lyric line: the video of that exact moment plays, and the
 * words missed in it are blanked for the player to fill in. A word whose song
 * or moment can't be found any more still gets a text-only card.
 */
export function ReviewSession({
  words,
  onFinish,
}: {
  words: WeakWord[]
  onFinish: (summary: ReviewSummary) => void
}) {
  const songs = useLibraryStore((s) => s.songs)
  const items = useMemo(() => buildReviewItems(words, songs), [words, songs])

  const [index, setIndex] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [replayCount, setReplayCount] = useState(0)
  const [rate, setRate] = useState(1)
  const statsRef = useRef({ correctCount: 0, masteredCount: 0, xpEarned: 0 })
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fuzzyMatching = useSettingsStore((s) => s.settings.fuzzyMatching)

  useEffect(
    () => () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    },
    [],
  )

  const item = items[index]
  const { tokens, blankWords } = buildReviewCard(
    item.contextText,
    item.words.map((w) => w.word),
  )

  // The first blank of each word is where its input goes; a repeat of the word later in the line stays a dotted blank.
  const firstBlank = new Map<string, number>()
  for (const [tokenIndex, word] of blankWords) {
    if (!firstBlank.has(word)) firstBlank.set(word, tokenIndex)
  }
  const inlineWords = item.words.filter((w) => firstBlank.has(w.word))
  // A word that can't be found in its line (old data) gets an input under the card instead.
  const looseWords = item.words.filter((w) => !firstBlank.has(w.word))
  const inputOrder = [...inlineWords, ...looseWords]
  const allFilled = inputOrder.every((w) => (values[w.word] ?? "").trim().length > 0)

  function advance() {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    if (index + 1 >= items.length) {
      onFinish({
        totalReviewed: words.length,
        correctCount: statsRef.current.correctCount,
        masteredCount: statsRef.current.masteredCount,
        xpEarned: statsRef.current.xpEarned,
      })
      return
    }
    setValues({})
    setFeedback(null)
    setIndex((i) => i + 1)
  }

  /**
   * Grades the card. Giving up ("I don't know") accepts blanks that were left
   * empty and counts them as missed; Check wants every blank filled in first.
   */
  function grade(giveUp: boolean) {
    if (feedback) return

    if (!giveUp) {
      // Enter in a half-filled card goes to the blank that's still empty.
      const empty = inputOrder.find((w) => (values[w.word] ?? "").trim().length === 0)
      if (empty) {
        inputRefs.current[empty.word]?.focus()
        return
      }
    }

    // The review store already keeps these answers, so the day counts toward
    // the streak now — not only if the player makes it to the end of the deck.
    // Idempotent per day, so calling it on every answer is harmless.
    useStatsStore.getState().recordActivityDay()

    const results: Record<string, WordResult> = {}
    for (const weak of item.words) {
      const guess = values[weak.word] ?? ""
      const answered = guess.trim().length > 0
      const isCorrect = answered && validateAnswer(guess, weak.word, { fuzzy: fuzzyMatching }).isCorrect

      if (isCorrect) {
        statsRef.current.correctCount += 1
        statsRef.current.xpEarned += XP_PER_CORRECT

        const mastered = useReviewStore.getState().recordCorrect(weak)
        if (mastered) {
          statsRef.current.masteredCount += 1
          statsRef.current.xpEarned += XP_PER_MASTERED
        }
      } else {
        // Recorded as the entry is stored, so it stays the same entry.
        useReviewStore.getState().recordMiss(weak.word, {
          songId: weak.songId,
          songTitle: weak.songTitle,
          artist: weak.artist,
          contextText: weak.contextText,
          clip: weak.clip,
        })
      }

      results[weak.word] = { isCorrect, insight: isCorrect || !answered ? null : analyzeMistake(guess, weak.word) }
    }

    const wrong = Object.values(results).filter((r) => !r.isCorrect)
    // Someone who gave up wants to read the answer, not watch it go by.
    const needsContinue = wrong.length > 0 && (giveUp || item.video !== null || wrong.some((r) => r.insight))
    setFeedback({ results, allCorrect: wrong.length === 0, needsContinue })

    // The answer is on screen now: hear the line once more with it.
    if (wrong.length > 0 && item.video) setReplayCount((n) => n + 1)

    if (!needsContinue) advanceTimerRef.current = setTimeout(advance, ADVANCE_DELAY_MS)
  }

  const wrongWords = feedback ? item.words.filter((w) => !feedback.results[w.word]?.isCorrect) : []

  function renderInput(weak: WeakWord, position: number, inline: boolean) {
    return (
      <input
        key={weak.word}
        ref={(el) => {
          inputRefs.current[weak.word] = el
        }}
        value={values[weak.word] ?? ""}
        onChange={(event) => setValues((current) => ({ ...current, [weak.word]: event.target.value }))}
        disabled={feedback !== null}
        autoFocus={position === 0}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={inline ? undefined : "Type the missing word…"}
        aria-label={inputOrder.length === 1 ? "Missing word" : `Missing word ${position + 1} of ${inputOrder.length}`}
        style={inline ? { width: `${Math.max(weak.word.length, 3) + 2}ch` } : undefined}
        className={cn(
          "border-0 border-b-2 border-dashed border-primary/50 bg-transparent text-center font-display font-semibold text-primary outline-none placeholder:text-primary/30 focus:border-solid focus:border-primary disabled:opacity-70",
          inline ? "rounded-none px-0.5 py-0" : "w-full max-w-xs rounded-lg px-2 py-1.5 text-lg",
        )}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="shrink-0 tabular-nums">
            {index + 1} / {items.length}
          </span>
          <span className="truncate">
            From <span className="font-medium text-foreground">{item.songTitle}</span> — {item.artist}
          </span>
        </div>
        <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: (index + (feedback ? 1 : 0)) / items.length }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {item.video && (
        <ReviewClipPlayer
          key={`${item.songId}:${item.video.youtubeId}`}
          youtubeId={item.video.youtubeId}
          songId={item.songId}
          clip={item.video.clip}
          playKey={`${index}:${replayCount}`}
          rate={rate}
          onRateChange={setRate}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "glass rounded-2xl px-5 py-8 text-center ring-2 ring-transparent transition-[box-shadow] duration-300 sm:px-6 sm:py-10",
            feedback?.allCorrect && "shadow-[0_0_40px_-12px_var(--glow-secondary)] ring-secondary/50",
            feedback && !feedback.allCorrect && "ring-destructive/40",
          )}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              grade(false)
            }}
            className="flex flex-col items-center gap-5"
          >
            {inlineWords.length > 0 ? (
              <>
                {item.video && !feedback && (
                  <p className="text-sm text-muted-foreground">
                    Listen, then fill in the missing {inlineWords.length === 1 ? "word" : "words"}.
                  </p>
                )}
                <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-2 font-display text-xl sm:text-2xl">
                  {tokens.map((token, i) => {
                    const blankWord = blankWords.get(i)
                    if (blankWord === undefined) {
                      return (
                        <span key={i} className="text-foreground/90">
                          {token}
                        </span>
                      )
                    }

                    const result = feedback?.results[blankWord]
                    if (result) {
                      return (
                        <span
                          key={i}
                          className={cn("font-semibold", result.isCorrect ? "text-secondary" : "text-destructive")}
                        >
                          {token}
                        </span>
                      )
                    }

                    const position = inlineWords.findIndex((w) => w.word === blankWord)
                    return firstBlank.get(blankWord) === i ? (
                      <span key={i}>{renderInput(inlineWords[position], position, true)}</span>
                    ) : (
                      <span key={i} aria-label="blank" className="tracking-widest text-primary/40">
                        {"•".repeat(Math.max(blankWord.length, 3))}
                      </span>
                    )
                  })}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Type the {looseWords.length === 1 ? "word" : "words"} you missed in this song:
              </p>
            )}

            {looseWords.length > 0 && (
              <div className="flex w-full flex-col items-center gap-3">
                {looseWords.map((weak, i) => renderInput(weak, inlineWords.length + i, false))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {feedback ? (
                <motion.div
                  key="feedback"
                  role="status"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  {feedback.allCorrect ? (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-secondary">
                      <Check aria-hidden className="size-4" /> Correct!
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      {wrongWords.map((weak) => (
                        <p key={weak.word} className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                          <X aria-hidden className="size-4" /> It was &ldquo;{weak.word}&rdquo;
                        </p>
                      ))}
                    </div>
                  )}

                  {wrongWords.map((weak) => {
                    const insight = feedback.results[weak.word]?.insight
                    return insight ? (
                      <p key={weak.word} className="max-w-sm text-sm text-muted-foreground">
                        {insight.explanation}
                      </p>
                    ) : null
                  })}

                  {feedback.needsContinue && (
                    <button
                      type="button"
                      autoFocus
                      onClick={advance}
                      className="min-h-11 rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground transition-transform duration-150 hover:scale-[1.03] active:scale-95"
                    >
                      Continue
                    </button>
                  )}
                </motion.div>
              ) : (
                <div key="actions" className="flex flex-col items-center gap-1">
                  <button
                    type="submit"
                    className={cn(
                      "min-h-11 rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground transition-[transform,opacity] duration-150 hover:scale-[1.03] active:scale-95",
                      !allFilled && "opacity-50",
                    )}
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={() => grade(true)}
                    className="min-h-11 rounded-full px-4 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    I don&apos;t know
                  </button>
                </div>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
