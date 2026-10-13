import { describe, expect, it } from "vitest"
import type { ExerciseLine } from "@/types/ExerciseLine"
import { arrangeBankSlots, bankTarget, initialBankSlots, upcomingBankWords } from "./wordBank"

/** Builds a line from words; a word wrapped in [] is a blank. */
function line(lineIndex: number, text: string): ExerciseLine {
  const words = text.split(" ")
  return {
    lineIndex,
    start: lineIndex * 5,
    end: lineIndex * 5 + 5,
    text: words.join(" ").replace(/[[\]]/g, ""),
    mode: "wordBank",
    tokens: words.map((raw, index) => {
      const hidden = raw.startsWith("[")
      const word = raw.replace(/[[\]]/g, "")
      return hidden ? { index, raw: word, isHidden: true, answer: word } : { index, raw: word, isHidden: false }
    }),
  }
}

const SONG = [
  line(0, "I [Walk] the [line]"),
  line(1, "keep my [eyes] [wide] open"),
  line(2, "all the [time] the [line]"),
  line(3, "I [find] it very [very] [easy] to be [true]"),
]

describe("bankTarget", () => {
  it("is the first open blank of the line", () => {
    expect(bankTarget(SONG, {}, 1)).toEqual({ exerciseIndex: 1, tokenIndex: 2 })
  })

  it("moves on once a blank is answered", () => {
    expect(bankTarget(SONG, { "1:2": true }, 1)).toEqual({ exerciseIndex: 1, tokenIndex: 3 })
  })

  it("is null when the line has nothing left to answer, or doesn't exist", () => {
    expect(bankTarget(SONG, { "0:1": true, "0:3": false }, 0)).toBeNull()
    expect(bankTarget(SONG, {}, 99)).toBeNull()
  })
})

describe("upcomingBankWords", () => {
  it("lists the next open answers in song order, lowercased", () => {
    const words = upcomingBankWords(SONG, {}, 0, 4).map((w) => w.word)

    expect(words).toEqual(["walk", "line", "eyes", "wide"])
  })

  it("offers a repeated word once, counting the times it is needed", () => {
    const words = upcomingBankWords(SONG, {}, 0, 6)

    expect(words.map((w) => w.word)).toEqual(["walk", "line", "eyes", "wide", "time", "find"])
    expect(words.find((w) => w.word === "line")?.count).toBe(2)
  })

  it("starts from the given line and skips answered blanks", () => {
    const words = upcomingBankWords(SONG, { "1:2": true }, 1, 3).map((w) => w.word)

    expect(words).toEqual(["wide", "time", "line"])
  })

  it("only counts repeats within the stretch the bank shows", () => {
    // With room for two words the bank stops at "eyes"; the "line" in line 2 is beyond it.
    const words = upcomingBankWords(SONG, {}, 0, 2)

    expect(words).toEqual([
      { word: "walk", count: 1 },
      { word: "line", count: 1 },
    ])
  })

  it("is empty when the song is finished", () => {
    const everything = Object.fromEntries(
      SONG.flatMap((l, li) => l.tokens.filter((t) => t.isHidden).map((t) => [`${li}:${t.index}`, true])),
    )

    expect(upcomingBankWords(SONG, everything, 0)).toEqual([])
  })
})

describe("arrangeBankSlots", () => {
  it("keeps words that are still wanted on their buttons", () => {
    const slots = arrangeBankSlots(["walk", "line", "eyes", null], ["line", "eyes", "wide"], 4)

    expect(slots[1]).toBe("line")
    expect(slots[2]).toBe("eyes")
  })

  it("puts a new word on the button a used word freed", () => {
    expect(arrangeBankSlots(["walk", "line", "eyes"], ["line", "eyes", "wide"], 3)).toEqual(["wide", "line", "eyes"])
  })

  it("leaves buttons empty when there are fewer words than buttons", () => {
    expect(arrangeBankSlots(["a", "b", "c"], ["c"], 3)).toEqual([null, null, "c"])
  })

  it("never shows a word twice", () => {
    const slots = arrangeBankSlots(["a", null, null], ["a", "a", "b"], 3)

    expect(slots.filter((word) => word === "a")).toHaveLength(1)
  })
})

describe("initialBankSlots", () => {
  const WORDS = ["walk", "line", "eyes", "wide", "time", "find"]

  it("lays out every word once", () => {
    expect([...initialBankSlots(WORDS, 7)].sort()).toEqual([...WORDS].sort())
  })

  it("is deterministic for a seed", () => {
    expect(initialBankSlots(WORDS, 42)).toEqual(initialBankSlots(WORDS, 42))
  })

  it("does not just read out the song order", () => {
    const seeds = [1, 2, 3, 4, 5]

    expect(seeds.some((seed) => initialBankSlots(WORDS, seed).join() !== WORDS.join())).toBe(true)
  })
})
