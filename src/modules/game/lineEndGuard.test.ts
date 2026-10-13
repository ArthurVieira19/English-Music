import { describe, expect, it } from "vitest"
import { LINE_END_FADE_SECONDS, LINE_END_PAUSE_LEAD_SECONDS, lineEndState } from "./lineEndGuard"

const END = 20
const PAUSE_AT = END - LINE_END_PAUSE_LEAD_SECONDS
const FADE_START = PAUSE_AT - LINE_END_FADE_SECONDS

describe("lineEndState", () => {
  it("leaves the audio alone for most of the line", () => {
    expect(lineEndState(12, END)).toEqual({ volume: 1, pause: false })
    expect(lineEndState(FADE_START, END)).toEqual({ volume: 1, pause: false })
  })

  it("eases the volume out over the last moment", () => {
    const halfway = lineEndState(FADE_START + LINE_END_FADE_SECONDS / 2, END)

    expect(halfway.pause).toBe(false)
    expect(halfway.volume).toBeCloseTo(0.5)
  })

  it("only ever lowers the volume as the end approaches", () => {
    let previous = 1
    for (let t = FADE_START; t < PAUSE_AT; t += 0.02) {
      const { volume } = lineEndState(t, END)
      expect(volume).toBeLessThanOrEqual(previous + 1e-9)
      previous = volume
    }
  })

  it("stops just before the line ends, so the next line never bleeds in", () => {
    expect(lineEndState(PAUSE_AT, END)).toEqual({ volume: 0, pause: true })
    expect(PAUSE_AT).toBeLessThan(END)
  })

  it("still stops if the moment was missed and time is already past the end", () => {
    expect(lineEndState(END + 0.5, END).pause).toBe(true)
  })
})
