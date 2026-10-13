/**
 * Stopping at the end of a line that still has open blanks. The song used to
 * be paused only once the synchronizer saw the *next* line start, so the
 * player always caught the first syllable of the next line, cut off mid-word.
 * Now the volume eases out over the last moment of the line and playback
 * stops just before the line ends.
 *
 * All times are lyric time (see OffsetMediaPlayer), in seconds.
 */

/** How long the volume takes to ease out. Short, so the end of the last word survives. */
export const LINE_END_FADE_SECONDS = 0.3

/**
 * How early to stop. The video keeps playing for a moment after it's told to
 * pause, so stopping exactly at the line's end would still let the next line
 * start to bleed through.
 */
export const LINE_END_PAUSE_LEAD_SECONDS = 0.1

export interface LineEndState {
  /** 0-1 multiplier for the player's chosen volume. */
  volume: number
  /** True once playback should stop and wait for the player. */
  pause: boolean
}

/** What to do with the audio at `time`, for a line ending at `lineEnd` that still has open blanks. */
export function lineEndState(time: number, lineEnd: number): LineEndState {
  const pauseAt = lineEnd - LINE_END_PAUSE_LEAD_SECONDS
  if (time >= pauseAt) return { volume: 0, pause: true }

  const fadeStart = pauseAt - LINE_END_FADE_SECONDS
  if (time <= fadeStart) return { volume: 1, pause: false }

  return { volume: (pauseAt - time) / LINE_END_FADE_SECONDS, pause: false }
}
