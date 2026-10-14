import { describe, expect, it } from "vitest"
import { describeShift, lineAt } from "./lyrics-sync-check"

const LINES = [
  { start: 19.32, end: 23.21, text: "We're no strangers to love" },
  { start: 23.21, end: 27.62, text: "You know the rules and so do I" },
]

describe("lineAt", () => {
  it("is -1 before the first line", () => {
    expect(lineAt(LINES, 5)).toBe(-1)
  })

  it("finds the line being sung, from the moment it starts", () => {
    expect(lineAt(LINES, 19.32)).toBe(0)
    expect(lineAt(LINES, 25)).toBe(1)
  })

  it("stays on the last line after it", () => {
    expect(lineAt(LINES, 300)).toBe(1)
  })
})

describe("describeShift", () => {
  it("says the lyrics are untouched at zero", () => {
    expect(describeShift(0)).toBe("Lyrics as timed")
  })

  it("words the shift from the lyrics' side", () => {
    expect(describeShift(23.31)).toBe("Lyrics start 23.31s later")
    expect(describeShift(-0.5)).toBe("Lyrics start 0.5s earlier")
  })
})
