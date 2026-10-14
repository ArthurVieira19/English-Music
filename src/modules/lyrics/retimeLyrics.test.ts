import { describe, expect, it } from "vitest"
import { parseLRC } from "./lrcParser"
import { RETIME_REACTION_SECONDS, addTap, formatLRC, retimeLyrics } from "./retimeLyrics"

const LINES = [
  { start: 0, end: 5.2, text: "See, right now" },
  { start: 5.2, end: 10.4, text: "You up now" },
  { start: 10.4, end: 15.6, text: "Slow down" },
  { start: 15.6, end: 19.6, text: "It's yours now" },
]

describe("retimeLyrics", () => {
  it("starts every tapped line at its tap", () => {
    const retimed = retimeLyrics(LINES, [23.5, 26.1, 29, 31.8])

    expect(retimed.map((l) => l.start)).toEqual([23.5, 26.1, 29, 31.8])
  })

  it("ends each line where the next begins", () => {
    const retimed = retimeLyrics(LINES, [23.5, 26.1, 29, 31.8])

    expect(retimed.slice(0, 3).map((l) => l.end)).toEqual([26.1, 29, 31.8])
  })

  it("keeps the last line's original length", () => {
    const [, , , last] = retimeLyrics(LINES, [23.5, 26.1, 29, 31.8])

    expect(last.end).toBeCloseTo(35.8)
  })

  it("moves the untapped rest of the song along with the last tapped line", () => {
    const retimed = retimeLyrics(LINES, [23.5, 26.1])

    // Line 1 moved from 5.2 to 26.1 (+20.9), so lines 2 and 3 move by the same.
    expect(retimed[2].start).toBeCloseTo(31.3)
    expect(retimed[3].start).toBeCloseTo(36.5)
    expect(retimed[1].end).toBeCloseTo(31.3)
  })

  it("keeps the text and the number of lines", () => {
    const retimed = retimeLyrics(LINES, [1])

    expect(retimed.map((l) => l.text)).toEqual(LINES.map((l) => l.text))
  })

  it("leaves the lyrics alone with no taps", () => {
    expect(retimeLyrics(LINES, [])).toBe(LINES)
  })

  it("ignores taps beyond the last line", () => {
    expect(retimeLyrics(LINES.slice(0, 1), [3, 9])).toEqual([{ start: 3, end: 8.2, text: "See, right now" }])
  })
})

describe("addTap", () => {
  it("records the tap minus the reaction time", () => {
    expect(addTap([], 23.7)).toEqual([+(23.7 - RETIME_REACTION_SECONDS).toFixed(3)])
  })

  it("ignores a tap that isn't later than the previous one", () => {
    expect(addTap([20], 20.1)).toEqual([20])
    expect(addTap([20], 15)).toEqual([20])
  })

  it("never records a negative time", () => {
    expect(addTap([], 0.05)).toEqual([0])
  })
})

describe("formatLRC", () => {
  it("writes standard LRC timestamps", () => {
    expect(formatLRC([{ start: 62.354, end: 65, text: "Hello" }])).toBe("[01:02.35]Hello")
    expect(formatLRC([{ start: 5, end: 6, text: "x" }])).toBe("[00:05.00]x")
  })

  it("round-trips through the parser", () => {
    const parsed = parseLRC(formatLRC(LINES))

    expect(parsed.map((l) => [l.start, l.text])).toEqual(LINES.map((l) => [l.start, l.text]))
  })

  it("carries a retiming through to the parser", () => {
    const parsed = parseLRC(formatLRC(retimeLyrics(LINES, [23.5, 26.1, 29, 31.8])))

    expect(parsed.map((l) => l.start)).toEqual([23.5, 26.1, 29, 31.8])
  })
})
