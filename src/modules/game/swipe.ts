/**
 * Recognises a deliberate sideways swipe on a touch screen — the phone's
 * "skip this word", since there is no Enter key to press there. Strict on
 * purpose: the lyrics scroll vertically under the same thumb, so a drag must
 * be clearly horizontal, long enough and quick enough to count.
 */

export const SWIPE_MIN_DISTANCE_PX = 70
/** Horizontal travel must beat vertical travel by this factor. */
export const SWIPE_MIN_RATIO = 2
export const SWIPE_MAX_DURATION_MS = 600

export interface SwipePoint {
  x: number
  y: number
  /** Milliseconds, any clock. */
  time: number
}

export function detectSwipe(start: SwipePoint, end: SwipePoint): "left" | "right" | null {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (end.time - start.time > SWIPE_MAX_DURATION_MS) return null
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_MIN_RATIO) return null

  return dx > 0 ? "right" : "left"
}
