import { describe, expect, it } from "vitest"
import { SWIPE_MAX_DURATION_MS, SWIPE_MIN_DISTANCE_PX, detectSwipe } from "./swipe"

const at = (x: number, y = 0, time = 0) => ({ x, y, time })

describe("detectSwipe", () => {
  it("recognises a quick sideways swipe in either direction", () => {
    expect(detectSwipe(at(0), at(120, 5, 200))).toBe("right")
    expect(detectSwipe(at(200), at(60, -10, 200))).toBe("left")
  })

  it("ignores a short drag", () => {
    expect(detectSwipe(at(0), at(SWIPE_MIN_DISTANCE_PX - 1, 0, 100))).toBeNull()
  })

  it("ignores a mostly vertical drag, which is the lyrics being scrolled", () => {
    expect(detectSwipe(at(0, 0), at(90, 80, 150))).toBeNull()
  })

  it("ignores a slow drag", () => {
    expect(detectSwipe(at(0), at(150, 0, SWIPE_MAX_DURATION_MS + 1))).toBeNull()
  })
})
