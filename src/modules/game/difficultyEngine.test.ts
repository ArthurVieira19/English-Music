import { describe, expect, it } from "vitest"
import {
  LEADING_WORDS_TO_SKIP,
  MAX_CARRIED_BLANKS,
  allocateBlanksByTime,
  hidingCandidates,
  selectWordsToHide,
} from "./difficultyEngine"

const WORDS = ["The", "brave", "fox", "jumped", "quickly", "over", "the", "lazy", "dog"]

describe("hidingCandidates", () => {
  it("leaves out the first words of a line", () => {
    const indices = hidingCandidates(["Running", "fast", "through", "the", "city", "streets"]).map((c) => c.index)

    expect(indices.length).toBeGreaterThan(0)
    for (const index of indices) expect(index).toBeGreaterThanOrEqual(LEADING_WORDS_TO_SKIP)
  })

  it("keeps the leading words when every word is being hidden", () => {
    expect(hidingCandidates(["Running", "fast", "through", "city"], true).map((c) => c.index)).toContain(0)
  })

  it("falls back to the leading words when nothing else in the line is eligible", () => {
    const indices = hidingCandidates(["Running", "fast", "the", "and"]).map((c) => c.index)

    expect(indices.length).toBeGreaterThan(0)
    for (const index of indices) expect([0, 1]).toContain(index)
  })

  it("never offers stop words or interjections", () => {
    const words = ["the", "cat", "and", "haha", "ran", "yeah"]

    for (const { index } of hidingCandidates(words, true)) {
      expect(["the", "and", "haha", "yeah"]).not.toContain(words[index])
    }
  })
})

describe("allocateBlanksByTime", () => {
  const line = (durationSeconds: number, candidates = 10) => ({ durationSeconds, candidates })

  it("asks for one blank per N seconds of music", () => {
    const counts = allocateBlanksByTime([line(6), line(6), line(6), line(6)], 3)

    expect(counts).toEqual([2, 2, 2, 2])
  })

  it("banks the leftover time of a short line for the next one", () => {
    // 2s is less than one blank's worth; it carries over and tips the next line to 2.
    expect(allocateBlanksByTime([line(2), line(5)], 3.5)).toEqual([0, 2])
  })

  it("hides more often at a faster pace", () => {
    const lines = [line(8), line(8), line(8)]
    const total = (rate: number) => allocateBlanksByTime(lines, rate).reduce((a, b) => a + b, 0)

    expect(total(1.5)).toBeGreaterThan(total(3))
    expect(total(3)).toBeGreaterThan(total(5))
  })

  it("never asks a line for more blanks than it has candidates", () => {
    expect(allocateBlanksByTime([line(30, 2)], 1)).toEqual([2])
  })

  it("passes time on from a line with nothing to hide", () => {
    expect(allocateBlanksByTime([line(4, 0), line(4)], 4)).toEqual([0, 2])
  })

  it("caps how much an instrumental break can pile onto the next line", () => {
    const [, afterBreak] = allocateBlanksByTime([line(60, 0), line(1)], 2)

    expect(afterBreak).toBe(MAX_CARRIED_BLANKS)
  })

  it("hides every candidate when the pace is zero", () => {
    expect(allocateBlanksByTime([line(1, 3), line(1, 5)], 0)).toEqual([3, 5])
  })

  it("still gives a very short song one blank", () => {
    expect(allocateBlanksByTime([line(1, 1), line(1, 4)], 10)).toEqual([0, 1])
  })

  it("gives no blanks when no line has anything to hide", () => {
    expect(allocateBlanksByTime([line(10, 0)], 2)).toEqual([0])
  })
})

describe("selectWordsToHide", () => {
  it("hides exactly the requested number of words", () => {
    expect(selectWordsToHide(WORDS, 2, "seed-1")).toHaveLength(2)
  })

  it("never hides more than the line can offer", () => {
    expect(selectWordsToHide(WORDS, 99, "seed-1")).toHaveLength(hidingCandidates(WORDS).length)
  })

  it("hides nothing when asked for none", () => {
    expect(selectWordsToHide(WORDS, 0, "seed-1")).toEqual([])
  })

  it("hides every candidate, leading words included, when told to hide all", () => {
    const indices = selectWordsToHide(["Running", "fast", "through", "city"], 0, "a", { hideAll: true })

    expect(indices).toContain(0)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it("is deterministic: same line + same seed = same result", () => {
    expect(selectWordsToHide(WORDS, 2, "song-42-line-3")).toEqual(selectWordsToHide(WORDS, 2, "song-42-line-3"))
  })

  it("produces different selections across seeds when a tier must be split", () => {
    const seeds = ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e", "seed-f"]
    // One word would always be the lone verb, "jumped"; a second has to be drawn from the nouns.
    const unique = new Set(seeds.map((seed) => selectWordsToHide(WORDS, 2, seed).join(",")))

    expect(unique.size).toBeGreaterThan(1)
  })

  it("returns indices in line order", () => {
    const indices = selectWordsToHide(WORDS, 3, "seed-1")

    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })
})

describe("selectWordsToHide with words the song already hid", () => {
  // Past the two leading words (kept visible), all four are plain nouns, so
  // they share one priority tier and the seed alone decides which one is hidden.
  const CHORUS = ["so", "sing", "river", "mountain", "ocean", "forest"]
  const AFTER_START = ["river", "mountain", "ocean", "forest"]
  const SEEDS = ["a", "b", "c", "d", "e", "f", "g", "h"]

  it("is identical to the plain selection when nothing was hidden before", () => {
    for (const seed of SEEDS) {
      expect(selectWordsToHide(CHORUS, 1, seed, { avoid: new Set() })).toEqual(selectWordsToHide(CHORUS, 1, seed))
    }
  })

  it("prefers a word the song has not hidden yet", () => {
    const avoid = new Set(["river", "mountain", "ocean"])

    for (const seed of SEEDS) {
      expect(selectWordsToHide(CHORUS, 1, seed, { avoid }).map((index) => CHORUS[index])).toEqual(["forest"])
    }
  })

  it("falls back to repeating a word when every candidate was already hidden", () => {
    const indices = selectWordsToHide(CHORUS, 1, "a", { avoid: new Set(AFTER_START) })

    expect(indices).toHaveLength(1)
    expect(AFTER_START).toContain(CHORUS[indices[0]])
  })

  it("never changes how many words are hidden", () => {
    for (const count of [1, 2, 3]) {
      expect(selectWordsToHide(CHORUS, count, "a", { avoid: new Set(AFTER_START) })).toHaveLength(count)
    }
  })
})
