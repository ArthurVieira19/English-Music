/**
 * How far the video runs behind the lyric timestamps, in seconds. Synced
 * lyrics are timed against one particular recording, and a YouTube upload of
 * the same song often has a longer intro or a cold open, so every line lands
 * a few seconds too early (positive offset) or, more rarely, too late
 * (negative offset). Lyric time = video time - offset.
 */

/** Beyond a minute the lyrics belong to a different recording altogether. */
export const MAX_SYNC_OFFSET = 60

/** Fine-tuning steps offered next to "Sync", in seconds. */
export const SYNC_NUDGES = [-0.5, -0.1, 0.1, 0.5] as const

/**
 * Time between a line starting to be sung and the player's tap landing. A
 * person needs about a quarter of a second to hear it, decide and press, so
 * tapping "at the instant it starts" always lands a little late.
 */
export const TAP_REACTION_SECONDS = 0.25

/** Keeps an offset finite, within range and at 10ms precision. */
export function clampOffset(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0
  const clamped = Math.max(-MAX_SYNC_OFFSET, Math.min(MAX_SYNC_OFFSET, seconds))
  // `+ 0` turns a -0 from rounding a tiny negative into a plain 0.
  return Math.round(clamped * 100) / 100 + 0
}

/**
 * The offset implied by a tap. The player taps when they hear `lineStart`'s
 * line begin, at video time `rawTime`; the line is really sung `reaction`
 * seconds earlier than the tap, so that is the video time it belongs to.
 */
export function offsetFromTap(input: { rawTime: number; lineStart: number; reactionSeconds?: number }): number {
  const reaction = input.reactionSeconds ?? TAP_REACTION_SECONDS
  return clampOffset(input.rawTime - reaction - input.lineStart)
}

/** Human wording for an offset, written from the viewer's side of the screen. */
export function describeOffset(seconds: number): string {
  const offset = clampOffset(seconds)
  if (offset === 0) return "In sync"

  const amount = `${Number(Math.abs(offset).toFixed(2))}s`
  return offset > 0 ? `Lyrics ${amount} later` : `Lyrics ${amount} earlier`
}
