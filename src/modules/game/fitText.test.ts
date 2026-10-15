import { describe, expect, it, vi } from "vitest"
import { MIN_FIT_FONT_PX, fitFontSize } from "./fitText"

/** Text that fits up to `limit` px. */
const fitsUpTo = (limit: number) => vi.fn((px: number) => px <= limit)

describe("fitFontSize", () => {
  it("leaves the font alone when the natural size fits", () => {
    expect(fitFontSize(24, fitsUpTo(30))).toBeNull()
  })

  it("finds the largest size that fits", () => {
    expect(fitFontSize(24, fitsUpTo(19))).toBe(19)
    expect(fitFontSize(30, fitsUpTo(29))).toBe(29)
    expect(fitFontSize(24, fitsUpTo(MIN_FIT_FONT_PX))).toBe(MIN_FIT_FONT_PX)
  })

  it("stops at the minimum when nothing fits", () => {
    expect(fitFontSize(24, fitsUpTo(10))).toBe(MIN_FIT_FONT_PX)
  })

  it("measures only a handful of times", () => {
    const fits = fitsUpTo(21)
    fitFontSize(30, fits)
    expect(fits.mock.calls.length).toBeLessThanOrEqual(6)
  })
})
