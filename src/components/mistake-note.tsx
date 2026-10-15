"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { Lightbulb, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MistakeNoteData {
  /** Changes with every note so a fresh one restarts the animation and the dismiss timer. */
  id: number
  /** `nudge` points at the kind of slip mid-try; `explain` unpacks it once the blank is resolved. */
  tone: "nudge" | "explain"
  guess: string
  answer: string
  text: string
}

const NUDGE_VISIBLE_MS = 6000
/** Long enough to read a two-sentence explanation without it vanishing mid-line. */
const EXPLAIN_VISIBLE_MS = 12000

/**
 * A short "why that was wrong" card for the game screen. Announced politely to
 * screen readers (role=status) and auto-dismissed, so it teaches without ever
 * blocking the next line.
 */
export function MistakeNote({
  note,
  onDismiss,
  className,
}: {
  note: MistakeNoteData
  onDismiss: () => void
  className?: string
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, note.tone === "explain" ? EXPLAIN_VISIBLE_MS : NUDGE_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [note.id, note.tone, onDismiss])

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass flex items-start gap-3 rounded-2xl px-4 py-3",
        note.tone === "explain" ? "ring-1 ring-primary/30" : "ring-1 ring-secondary/30",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          note.tone === "explain" ? "bg-primary/15 text-primary" : "bg-secondary/15 text-secondary",
        )}
      >
        <Lightbulb className="size-4" />
      </span>

      <div className="min-w-0 flex-1 text-sm">
        {note.tone === "explain" && (
          <p className="font-display font-semibold">
            <span className="text-destructive line-through decoration-1">{note.guess}</span>
            <span aria-hidden className="mx-1.5 text-muted-foreground">
              →
            </span>
            <span className="sr-only"> was corrected to </span>
            <span className="text-secondary">{note.answer}</span>
          </p>
        )}
        <p className={cn("text-muted-foreground", note.tone === "explain" && "mt-0.5")}>{note.text}</p>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss tip"
        className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </motion.div>
  )
}
