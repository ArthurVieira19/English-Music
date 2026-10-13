import { describe, expect, it } from "vitest"
import { shiftLyrics } from "./shiftLyrics"

const LINES = [
  { start: 1, end: 4, text: "one" },
  { start: 4, end: 9.5, text: "two" },
]

describe("shiftLyrics", () => {
  it("moves every line later for a video with a longer intro", () => {
    expect(shiftLyrics(LINES, 12.25)).toEqual([
      { start: 13.25, end: 16.25, text: "one" },
      { start: 16.25, end: 21.75, text: "two" },
    ])
  })

  it("moves lines earlier, clipping one that crosses the start and dropping one that ends before it", () => {
    expect(shiftLyrics(LINES, -5)).toEqual([{ start: 0, end: 4.5, text: "two" }])
  })

  it("returns the same lines for no shift", () => {
    expect(shiftLyrics(LINES, 0)).toBe(LINES)
    expect(shiftLyrics(LINES, Number.NaN)).toBe(LINES)
  })

  it("does not pile up floating-point noise", () => {
    expect(shiftLyrics([{ start: 0.1, end: 0.2, text: "x" }], 0.2)[0]).toEqual({ start: 0.3, end: 0.4, text: "x" })
  })
})
