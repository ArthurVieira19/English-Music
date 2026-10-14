import type { LyricLine } from "@/types/LyricLine"

/**
 * Line-by-line retiming ("tap along"): the admin plays the video and taps the
 * moment each line starts. That fixes lyrics a single offset can't — ones
 * whose lines are each off by a different amount, like a version whose first
 * lines were spaced out evenly instead of following the singing.
 */

/** Taps land a little after the singing starts; this is taken off each one. */
export const RETIME_REACTION_SECONDS = 0.2

const DEFAULT_LAST_LINE_SECONDS = 4

const round = (seconds: number) => Math.round(seconds * 1000) / 1000

/**
 * New timing from the taps so far: `taps[i]` (video seconds, reaction already
 * removed) becomes the start of line i. Lines after the last tap keep their
 * original spacing, moved by however much the last tapped line moved, so
 * stopping halfway still leaves the rest of the song in a sensible place.
 * Each line ends where the next begins.
 */
export function retimeLyrics(lines: LyricLine[], taps: number[]): LyricLine[] {
  if (lines.length === 0 || taps.length === 0) return lines

  const tapped = Math.min(taps.length, lines.length)
  const shiftRest = taps[tapped - 1] - lines[tapped - 1].start

  const starts = lines.map((line, index) =>
    round(Math.max(0, index < tapped ? taps[index] : line.start + shiftRest)),
  )

  return lines.map((line, index) => {
    const start = starts[index]
    const nextStart = starts[index + 1]
    const originalLength = line.end - line.start
    const end =
      nextStart !== undefined && nextStart > start
        ? nextStart
        : round(start + (originalLength > 0 ? originalLength : DEFAULT_LAST_LINE_SECONDS))
    return { ...line, start, end }
  })
}

/**
 * Records a tap at `videoTime` for the next line, or ignores it when it
 * isn't later than the previous one (a double tap, or a tap after seeking
 * backwards) — line starts must keep their order.
 */
export function addTap(taps: number[], videoTime: number, reaction = RETIME_REACTION_SECONDS): number[] {
  const time = round(Math.max(0, videoTime - reaction))
  const previous = taps[taps.length - 1]
  if (previous !== undefined && time <= previous) return taps
  return [...taps, time]
}

function pad(value: number, digits: number): string {
  return value.toString().padStart(digits, "0")
}

/** Writes lines back as LRC text ("[01:02.35]line"), the format the lyrics box holds. */
export function formatLRC(lines: LyricLine[]): string {
  return lines
    .map((line) => {
      const centiseconds = Math.round(Math.max(0, line.start) * 100)
      const minutes = Math.floor(centiseconds / 6000)
      const seconds = Math.floor((centiseconds % 6000) / 100)
      const hundredths = centiseconds % 100
      return `[${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(hundredths, 2)}]${line.text}`
    })
    .join("\n")
}
