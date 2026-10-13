import { describe, expect, it } from "vitest"
import {
  MAX_SYNC_OFFSET,
  TAP_REACTION_SECONDS,
  clampOffset,
  describeOffset,
  offsetFromTap,
} from "./syncOffset"

describe("clampOffset", () => {
  it("keeps ordinary values and rounds to 10ms", () => {
    expect(clampOffset(1.5)).toBe(1.5)
    expect(clampOffset(0.123456)).toBe(0.12)
    expect(clampOffset(-2.004)).toBe(-2)
  })

  it("limits runaway values to the maximum in either direction", () => {
    expect(clampOffset(500)).toBe(MAX_SYNC_OFFSET)
    expect(clampOffset(-500)).toBe(-MAX_SYNC_OFFSET)
  })

  it("treats anything that isn't a finite number as no offset", () => {
    expect(clampOffset(Number.NaN)).toBe(0)
    expect(clampOffset(Infinity)).toBe(0)
  })

  it("never returns negative zero", () => {
    expect(Object.is(clampOffset(-0.001), 0)).toBe(true)
  })
})

describe("offsetFromTap", () => {
  it("is the video time of the tap, minus reaction time, minus where the line says it starts", () => {
    // The line is stamped at 10s, the singer actually starts it at video time 14s,
    // and the player taps a quarter second after hearing it.
    const offset = offsetFromTap({ rawTime: 14 + TAP_REACTION_SECONDS, lineStart: 10 })

    expect(offset).toBe(4)
  })

  it("is negative when the lyrics run late", () => {
    expect(offsetFromTap({ rawTime: 8 + TAP_REACTION_SECONDS, lineStart: 10 })).toBe(-2)
  })

  it("lets the reaction time be overridden", () => {
    expect(offsetFromTap({ rawTime: 12, lineStart: 10, reactionSeconds: 0 })).toBe(2)
  })

  it("stays inside the allowed range", () => {
    expect(offsetFromTap({ rawTime: 9999, lineStart: 0 })).toBe(MAX_SYNC_OFFSET)
  })
})

describe("describeOffset", () => {
  it("says in sync at zero", () => {
    expect(describeOffset(0)).toBe("In sync")
    expect(describeOffset(0.004)).toBe("In sync")
  })

  it("words a positive offset as the lyrics coming later", () => {
    expect(describeOffset(2)).toBe("Lyrics 2s later")
    expect(describeOffset(1.5)).toBe("Lyrics 1.5s later")
    expect(describeOffset(0.25)).toBe("Lyrics 0.25s later")
  })

  it("words a negative offset as the lyrics coming earlier", () => {
    expect(describeOffset(-0.5)).toBe("Lyrics 0.5s earlier")
  })
})
