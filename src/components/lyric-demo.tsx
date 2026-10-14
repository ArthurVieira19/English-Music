"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

// Original lines (not real lyrics): the demo only needs to show the mechanic.
const LINES = [
  { before: "City lights are", word: "humming", after: "in the rain tonight" },
  { before: "I keep your", word: "number", after: "but I never call" },
  { before: "Turn it up and", word: "never", after: "let it go" },
] as const

const TYPE_MS = 110
const HOLD_MS = 1600

type Phase = "typing" | "correct"

/**
 * The whole game in one line: a blank fills itself in letter by letter, turns
 * blue and pays out points, then the next line comes in. With reduced motion
 * it shows a finished line and stays put. `onNavy` uses the .navy-stage inks.
 */
export function LyricDemo({ className, onNavy = false }: { className?: string; onNavy?: boolean }) {
  const red = onNavy ? "text-(--stage-red)" : "text-primary"
  const blue = onNavy ? "text-(--stage-blue)" : "text-secondary"
  const reduceMotion = useReducedMotion()
  const [lineIndex, setLineIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<Phase>("typing")

  const line = LINES[lineIndex]

  useEffect(() => {
    if (reduceMotion) return
    if (phase === "typing") {
      if (typed < line.word.length) {
        const id = setTimeout(() => setTyped((n) => n + 1), typed === 0 ? 700 : TYPE_MS)
        return () => clearTimeout(id)
      }
      const id = setTimeout(() => setPhase("correct"), 180)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setLineIndex((i) => (i + 1) % LINES.length)
      setTyped(0)
      setPhase("typing")
    }, HOLD_MS)
    return () => clearTimeout(id)
  }, [reduceMotion, phase, typed, line.word.length])

  const shown = reduceMotion ? line.word : line.word.slice(0, typed)
  const isCorrect = reduceMotion || phase === "correct"

  return (
    <div aria-hidden className={cn("relative", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={lineIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-2xl leading-snug font-medium text-balance sm:text-3xl"
        >
          {line.before}{" "}
          <span className="relative inline-flex">
            <span
              className={cn(
                "inline-block min-w-[5ch] border-b-2 px-1 text-center transition-colors duration-200",
                isCorrect ? cn("border-current", blue) : cn("border-dashed border-current", red),
              )}
            >
              {shown}
              {!isCorrect && <span className="ml-px inline-block h-[0.9em] w-[2px] translate-y-[0.1em] animate-pulse bg-current" />}
              {!shown && !isCorrect && <span className="opacity-0">{line.word}</span>}
            </span>
            <AnimatePresence>
              {isCorrect && !reduceMotion && (
                <motion.span
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [0, -14, -22, -30] }}
                  transition={{ duration: 1.2, times: [0, 0.15, 0.7, 1] }}
                  className={cn("absolute -top-4 right-0 font-display text-base font-bold", blue)}
                >
                  +150
                </motion.span>
              )}
            </AnimatePresence>
          </span>{" "}
          {line.after}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
