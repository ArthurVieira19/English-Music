import type { LyricLine } from "@/types/LyricLine"

/**
 * Moves every line `offsetSeconds` later (or earlier, when negative) so the
 * lyrics land on a particular video instead of the recording they were timed
 * against. Used to bake a sync correction into a song when it is added, so
 * every player gets lyrics that already match its video.
 *
 * A line pushed entirely before the video starts is dropped; one that only
 * partly crosses zero is clipped to start at 0.
 */
export function shiftLyrics(lines: LyricLine[], offsetSeconds: number): LyricLine[] {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds === 0) return lines

  const round = (seconds: number) => Math.round(seconds * 1000) / 1000

  return lines
    .map((line) => ({ ...line, start: round(line.start + offsetSeconds), end: round(line.end + offsetSeconds) }))
    .filter((line) => line.end > 0)
    .map((line) => (line.start < 0 ? { ...line, start: 0 } : line))
}
