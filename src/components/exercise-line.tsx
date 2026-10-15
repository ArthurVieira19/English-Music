"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useAnimationControls } from "framer-motion"
import type { ExerciseLine, ExerciseToken } from "@/types/ExerciseLine"
import { isSingleInsertOrDeleteAway, normalize } from "@/modules/game/answerValidator"
import { MAX_ATTEMPTS } from "@/modules/game/scoreEngine"
import { answeredTokenKey } from "@/stores/gameStore"
import { WordDefinitionPopover } from "@/components/word-definition-popover"
import { cn } from "@/lib/utils"

const NO_WRONG_GUESSES: Record<string, string[]> = {}

interface ExerciseLineViewProps {
  line: ExerciseLine
  exerciseIndex: number
  answeredTokens: Record<string, boolean>
  /** Wrong guesses already made on each still-open blank (see gameStore) — drives the "last try" state. */
  wrongGuesses?: Record<string, string[]>
  onSubmit: (tokenIndex: number, value: string) => void
  /** Renders compact, high-contrast styling suited for overlaying on video. */
  caption?: boolean
  /** Whether a near-miss (one missing/extra character) auto-confirms as correct. Defaults to true. */
  fuzzy?: boolean
  /** Renders multiple-choice blanks as plain placeholders instead of pill buttons — used when the choice pills are shown separately (see ExerciseChoicesView). */
  hideChoicePills?: boolean
  /** Backspace in an empty blank: hear the line again. */
  onReplay?: () => void
  /** Enter in an empty blank: give up on that word. */
  onSkip?: (tokenIndex: number) => void
}

export function ExerciseLineView({
  line,
  exerciseIndex,
  answeredTokens,
  wrongGuesses = NO_WRONG_GUESSES,
  onSubmit,
  caption = false,
  fuzzy = true,
  hideChoicePills = false,
  onReplay,
  onSkip,
}: ExerciseLineViewProps) {
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  // Word-bank blanks are answered from the bank, so they render as placeholders, not inputs.
  const isWordBank = line.mode === "wordBank"

  // Keeps the player typing without ever having to click: focuses the next
  // unanswered typed blank whenever this line becomes active or an answer
  // in it is submitted. Multiple-choice tokens pick via click, not typing,
  // so they're skipped here.
  useEffect(() => {
    if (isWordBank) return
    const nextToken = line.tokens.find(
      (token) =>
        token.isHidden &&
        !token.choices &&
        !(`${exerciseIndex}:${token.index}` in answeredTokens),
    )
    if (nextToken) {
      inputRefs.current[nextToken.index]?.focus({ preventScroll: true })
    }
  }, [line, exerciseIndex, answeredTokens, isWordBank])

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2.5 gap-y-3 text-center font-display leading-relaxed",
        caption ? "text-lg text-white drop-shadow-sm sm:text-2xl" : "text-2xl sm:text-3xl",
      )}
    >
      {line.tokens.map((token) => {
        const key = `${exerciseIndex}:${token.index}`
        return (
          <ExerciseTokenView
            key={token.index}
            token={token}
            isAnswered={key in answeredTokens}
            isCorrect={answeredTokens[key]}
            wrongGuesses={wrongGuesses[key] ?? []}
            onSubmit={(value) => onSubmit(token.index, value)}
            caption={caption}
            fuzzy={fuzzy}
            hideChoicePills={hideChoicePills}
            isWordBank={isWordBank}
            onReplay={onReplay}
            onSkip={onSkip ? () => onSkip(token.index) : undefined}
            inputRef={(el) => {
              inputRefs.current[token.index] = el
            }}
          />
        )
      })}
    </div>
  )
}

function ExerciseTokenView({
  token,
  isAnswered,
  isCorrect,
  wrongGuesses,
  onSubmit,
  caption,
  fuzzy,
  hideChoicePills,
  isWordBank,
  onReplay,
  onSkip,
  inputRef,
}: {
  token: ExerciseToken
  isAnswered: boolean
  isCorrect?: boolean
  wrongGuesses: string[]
  onSubmit: (value: string) => void
  caption: boolean
  fuzzy: boolean
  hideChoicePills: boolean
  isWordBank: boolean
  onReplay?: () => void
  onSkip?: () => void
  inputRef: (el: HTMLInputElement | null) => void
}) {
  const attemptsUsed = wrongGuesses.length
  // The typed text is tagged with the attempt it belongs to, so a wrong guess
  // empties the box for the next try without an effect to reset it.
  const [typed, setTyped] = useState({ attempt: 0, text: "" })
  const value = typed.attempt === attemptsUsed ? typed.text : ""
  const shake = useAnimationControls()

  useEffect(() => {
    if (attemptsUsed > 0) void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } })
  }, [attemptsUsed, shake])

  if (!token.isHidden) {
    return (
      <WordDefinitionPopover word={token.raw} className={caption ? "text-white/90" : "text-foreground/90"}>
        {token.raw}
      </WordDefinitionPopover>
    )
  }

  if (isAnswered) {
    return (
      <WordDefinitionPopover word={token.raw}>
        <motion.span
          initial={{ scale: 0.85, opacity: 0 }}
          animate={
            isCorrect
              ? { scale: [0.85, 1.15, 1], opacity: 1 }
              : { scale: 1, opacity: 1, x: [0, -6, 6, -4, 4, 0] }
          }
          transition={{ duration: 0.4 }}
          aria-label={`${token.raw} — ${isCorrect ? "correct" : "incorrect"}`}
          className={cn(
            "inline-block rounded-lg px-2 py-0.5 font-semibold",
            isCorrect
              ? "bg-secondary/20 text-secondary shadow-[0_0_18px_-4px_var(--glow-secondary)]"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {token.raw}
        </motion.span>
      </WordDefinitionPopover>
    )
  }

  if (isWordBank) {
    const blankWidth = Math.max(token.answer?.length ?? 3, 3)
    return (
      <span
        aria-label={token.answer ? `Missing word, ${token.answer.length} letters` : "Missing word"}
        className={cn("tracking-widest", caption ? "text-white/50" : "text-secondary/60")}
      >
        {"•".repeat(blankWidth)}
      </span>
    )
  }

  if (token.choices) {
    if (hideChoicePills) {
      const blankWidth = Math.max(token.answer?.length ?? 3, 3)
      return (
        <span
          aria-label={token.answer ? `Missing word, ${token.answer.length} letters` : "Missing word"}
          className={cn("tracking-widest", caption ? "text-white/50" : "text-secondary/60")}
        >
          {"•".repeat(blankWidth)}
        </span>
      )
    }

    return (
      <span
        role="group"
        aria-label="Choose the missing word"
        className="inline-flex flex-wrap justify-center gap-2 align-middle text-base"
      >
        {token.choices.map((choice) => (
          <motion.button
            key={choice}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.96 }}
            disabled={wrongGuesses.includes(choice)}
            onClick={() => onSubmit(choice)}
            className="rounded-full border border-border bg-accent/60 px-4 py-1.5 font-body text-sm font-medium transition-colors enabled:hover:border-secondary/50 enabled:hover:bg-secondary/10 enabled:hover:text-secondary disabled:text-destructive/60 disabled:line-through disabled:opacity-50"
          >
            {choice}
          </motion.button>
        ))}
      </span>
    )
  }

  const width = `${Math.max(token.answer?.length ?? 4, 3) + 2}ch`
  const isLastTry = attemptsUsed > 0 && attemptsUsed >= MAX_ATTEMPTS - 1
  const baseLabel = token.answer ? `Missing word, ${token.answer.length} letters` : "Missing word"

  return (
    <motion.input
      ref={inputRef}
      animate={shake}
      style={{ width }}
      className={cn(
        // scroll-mb: when a tap focuses the blank, the browser scrolls it clear of the fixed transport bar instead of leaving it underneath.
        "inline-block scroll-mb-40 rounded-md border-0 border-b-2 border-dashed bg-transparent px-1 pb-0.5 text-center font-display font-semibold text-foreground outline-none placeholder:text-secondary/40 focus:border-solid",
        isLastTry
          ? "border-destructive/70 focus:border-destructive"
          : "border-secondary/60 focus:border-secondary",
      )}
      value={value}
      aria-label={isLastTry ? `${baseLabel} — last try` : baseLabel}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value
        setTyped({ attempt: attemptsUsed, text: next })
        if (!token.answer) return

        const normalizedNext = normalize(next)
        const normalizedAnswer = normalize(token.answer)
        const isExactMatch = normalizedNext === normalizedAnswer
        // Only auto-confirms exact matches or a near-miss one character off
        // (a missing apostrophe/hyphen, a doubled letter, one letter short)
        // — not a broader fuzzy match, so it helps with rushed typing
        // without just guessing the word for the player.
        const isNearMiss =
          fuzzy &&
          normalizedAnswer.length > 3 &&
          isSingleInsertOrDeleteAway(normalizedNext, normalizedAnswer)

        if (isExactMatch || isNearMiss) {
          onSubmit(next)
        }
      }}
      onKeyDown={(event) => {
        const isEmpty = value.trim().length === 0
        if (event.key === "Enter") {
          if (!isEmpty) onSubmit(value)
          else if (onSkip && !event.repeat) onSkip()
          return
        }
        // Only a fresh press on an already-empty blank: holding Backspace to
        // clear a word must never roll the song back.
        if (event.key === "Backspace" && value.length === 0 && onReplay && !event.repeat) {
          event.preventDefault()
          onReplay()
        }
      }}
      placeholder="···"
    />
  )
}

/**
 * Standalone pool of multiple-choice pill buttons for the active line's
 * next unanswered blank — rendered apart from the lyrics text (see the
 * word-choice panel in game-screen.tsx) instead of inline, so the lyrics
 * column can show plain blanks via ExerciseLineView's hideChoicePills.
 * Only one blank's options show at a time, so the pool never grows past
 * the 4 choices that blank carries.
 */
export function ExerciseChoicesView({
  line,
  exerciseIndex,
  answeredTokens,
  wrongGuesses = NO_WRONG_GUESSES,
  onSubmit,
}: {
  line: ExerciseLine
  exerciseIndex: number
  answeredTokens: Record<string, boolean>
  wrongGuesses?: Record<string, string[]>
  onSubmit: (tokenIndex: number, value: string) => void
}) {
  const nextChoiceToken = line.tokens.find(
    (token) =>
      token.isHidden && token.choices && !(answeredTokenKey(exerciseIndex, token.index) in answeredTokens),
  )

  if (!nextChoiceToken) return null

  const ruledOut = wrongGuesses[answeredTokenKey(exerciseIndex, nextChoiceToken.index)] ?? []

  return (
    <div
      role="group"
      aria-label="Choose the missing word"
      // Keyed by token so a new blank's options re-run their entrance.
      key={`${exerciseIndex}:${nextChoiceToken.index}`}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {nextChoiceToken.choices?.map((choice, i) => (
        <motion.button
          key={choice}
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 }}
          whileTap={{ scale: 0.96 }}
          disabled={ruledOut.includes(choice)}
          onClick={() => onSubmit(nextChoiceToken.index, choice)}
          className="min-h-11 truncate rounded-xl border border-border bg-accent/60 px-3 font-body text-base font-medium transition-colors duration-150 enabled:hover:border-secondary/50 enabled:hover:bg-secondary/10 enabled:hover:text-secondary disabled:text-destructive/60 disabled:line-through disabled:opacity-50"
        >
          {choice}
        </motion.button>
      ))}
    </div>
  )
}
