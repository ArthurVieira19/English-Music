import { describe, expect, it } from "vitest"
import {
  CLIP_LEAD_IN_SECONDS,
  CLIP_MAX_SECONDS,
  CLIP_MIN_SECONDS,
  clipWindow,
  findClipForWord,
  findSourceLine,
  isValidClip,
} from "./reviewClip"
import { groupLyricLines } from "@/modules/lyrics/groupLyricLines"

const LYRICS = [
  { start: 10, end: 13, text: "we sing river mountain" },
  { start: 13, end: 16, text: "ocean forest wide open" },
  { start: 40, end: 44, text: "a different verse far away" },
]

describe("findSourceLine", () => {
  const [group] = groupLyricLines(LYRICS)

  it("sets up a group made of the first two lines", () => {
    expect(group).toEqual({ start: 10, end: 16, text: "we sing river mountain ocean forest wide open" })
  })

  it("finds the lyric line a word of a grouped line was sung in", () => {
    // token 1 is "sing" (first line), token 4 is "ocean" (second line)
    expect(findSourceLine(LYRICS, group, 1)).toEqual(LYRICS[0])
    expect(findSourceLine(LYRICS, group, 3)).toEqual(LYRICS[0])
    expect(findSourceLine(LYRICS, group, 4)).toEqual(LYRICS[1])
    expect(findSourceLine(LYRICS, group, 7)).toEqual(LYRICS[1])
  })

  it("gives up rather than guess when the group no longer matches the lyrics", () => {
    const edited = [{ ...LYRICS[0], text: "we sing something else" }, LYRICS[1]]
    expect(findSourceLine(edited, group, 1)).toBeNull()
  })

  it("gives up for a token past the end of the group", () => {
    expect(findSourceLine(LYRICS, group, 99)).toBeNull()
  })
})

describe("findClipForWord", () => {
  it("finds the line of a song from the grouped text that was saved before clips existed", () => {
    const found = findClipForWord(LYRICS, "we sing river mountain ocean forest wide open", "ocean")

    expect(found).toEqual({ contextText: "ocean forest wide open", clip: { start: 13, end: 16 } })
  })

  it("takes the first line holding the word when the group has it twice", () => {
    const lyrics = [
      { start: 0, end: 2, text: "oh love is here" },
      { start: 2, end: 4, text: "and love will stay" },
    ]
    const found = findClipForWord(lyrics, "oh love is here and love will stay", "love")

    expect(found?.clip).toEqual({ start: 0, end: 2 })
  })

  it("accepts a context that is already a single lyric line", () => {
    const found = findClipForWord(LYRICS, "a different verse far away", "verse")

    expect(found?.clip).toEqual({ start: 40, end: 44 })
  })

  it("matches regardless of case and punctuation", () => {
    const found = findClipForWord([{ start: 1, end: 3, text: "Hello, darkness my old friend" }], "Hello, darkness my old friend", "hello")

    expect(found?.clip).toEqual({ start: 1, end: 3 })
  })

  it("returns null when the line is not in the song", () => {
    expect(findClipForWord(LYRICS, "something never sung", "never")).toBeNull()
  })
})

describe("clipWindow", () => {
  it("starts a moment early and ends where the line ends", () => {
    expect(clipWindow({ start: 13, end: 16 })).toEqual({ from: 13 - CLIP_LEAD_IN_SECONDS, to: 16 })
  })

  it("starts two seconds before the line, to give the player time to get ready", () => {
    expect(clipWindow({ start: 13, end: 16 }).from).toBe(11)
  })

  it("starts at the very beginning for a line sung in the first two seconds", () => {
    expect(clipWindow({ start: 1.2, end: 4 }).from).toBe(0)
  })

  it("never starts before the beginning of the video", () => {
    expect(clipWindow({ start: 0.1, end: 3 }).from).toBe(0)
  })

  it("stretches a very short line so it can be heard", () => {
    expect(clipWindow({ start: 20, end: 20.4 }).to).toBe(20 + CLIP_MIN_SECONDS)
  })

  it("cuts off a line that runs into a long instrumental break", () => {
    expect(clipWindow({ start: 20, end: 80 }).to).toBe(20 + CLIP_MAX_SECONDS)
  })
})

describe("isValidClip", () => {
  it("accepts a normal clip", () => {
    expect(isValidClip({ start: 1, end: 2 })).toBe(true)
  })

  it.each([
    undefined,
    null,
    {},
    { start: 5, end: 5 },
    { start: 5, end: 2 },
    { start: -1, end: 2 },
    { start: "1", end: 2 },
    { start: NaN, end: 2 },
  ])("rejects %j", (clip) => {
    expect(isValidClip(clip)).toBe(false)
  })
})
