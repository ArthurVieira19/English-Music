"use client"

import { useState } from "react"
import { Timer } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SYNC_NUDGES, describeOffset } from "@/modules/game/syncOffset"
import { cn } from "@/lib/utils"

function nudgeLabel(step: number): string {
  const amount = Math.abs(step)
  return step > 0 ? `Show lyrics ${amount} seconds later` : `Show lyrics ${amount} seconds earlier`
}

function formatStep(step: number): string {
  return `${step > 0 ? "+" : "−"}${Math.abs(step)}s`
}

/**
 * Fixes lyrics that run ahead of (or behind) the singer. A YouTube upload often
 * has a different intro than the recording the lyrics were timed against, so
 * the right correction is per song. Two ways in: tap the instant the
 * highlighted line is sung (rough and fast), then nudge to taste.
 */
export function SyncControl({
  offset,
  onChange,
  onTap,
  disabled,
}: {
  offset: number
  onChange: (seconds: number) => void
  /** Calibrates against the highlighted line; false when there is nothing to calibrate against right now. */
  onTap: () => boolean
  disabled?: boolean
}) {
  const [hint, setHint] = useState<string | null>(null)
  const isAdjusted = offset !== 0

  function handleTap() {
    setHint(onTap() ? null : "Wait for a line to start, then try again.")
  }

  return (
    <Popover onOpenChange={() => setHint(null)}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Lyrics sync: ${describeOffset(offset)}`}
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[transform,color,background-color] duration-150 disabled:opacity-40 enabled:active:scale-95",
          isAdjusted
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border bg-accent/60 text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground",
        )}
      >
        <Timer aria-hidden className="size-4" />
        <span>{isAdjusted ? describeOffset(offset) : "Lyrics out of sync?"}</span>
      </PopoverTrigger>

      <PopoverContent className="w-72" side="top" align="end">
        <p className="px-1 text-sm font-semibold">Lyrics timing</p>
        <p className="mb-3 px-1 text-xs text-muted-foreground" aria-live="polite">
          {describeOffset(offset)} · saved for this song
        </p>

        <button
          type="button"
          onClick={handleTap}
          className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-150 hover:scale-[1.02] active:scale-95"
        >
          Tap when the highlighted line is sung
        </button>
        {hint && (
          <p role="status" className="mt-2 px-1 text-xs text-muted-foreground">
            {hint}
          </p>
        )}

        <p className="mt-4 mb-1.5 px-1 text-xs font-medium text-muted-foreground">
          Or nudge it. Lyrics ahead of the singer? Make them later.
        </p>
        <div role="group" aria-label="Nudge lyrics timing" className="grid grid-cols-4 gap-1.5">
          {SYNC_NUDGES.map((step) => (
            <button
              key={step}
              type="button"
              aria-label={nudgeLabel(step)}
              onClick={() => onChange(offset + step)}
              className="rounded-lg border border-border bg-accent/60 py-2 text-sm font-medium tabular-nums transition-[transform,background-color] duration-150 hover:bg-accent active:scale-95"
            >
              {formatStep(step)}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!isAdjusted}
          onClick={() => onChange(0)}
          className="mt-3 w-full rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-40"
        >
          Reset to original timing
        </button>
      </PopoverContent>
    </Popover>
  )
}
