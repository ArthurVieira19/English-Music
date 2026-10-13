import { describe, expect, it } from "vitest"
import {
  blanksPerLine,
  estimateHiddenWordCounts,
  extractCoreWord,
  generateExerciseLine,
  generateSongExercises,
} from "./exerciseGenerator"
import { LEVELS, levelId, type Level } from "./levels"
import type { LyricLine } from "@/types/LyricLine"

const LINE: LyricLine = { start: 10, end: 14, text: "The brave fox jumped quickly, oohh!" }

describe("extractCoreWord", () => {
  it("strips surrounding punctuation", () => {
    expect(extractCoreWord("fox,")).toBe("fox")
    expect(extractCoreWord("(quickly)")).toBe("quickly")
    expect(extractCoreWord("oohh!")).toBe("oohh")
  })

  it("keeps internal apostrophes", () => {
    expect(extractCoreWord("don't")).toBe("don't")
  })

  it("returns empty string for tokens with no letters", () => {
    expect(extractCoreWord("...")).toBe("")
    expect(extractCoreWord("-")).toBe("")
  })
})

describe("generateExerciseLine", () => {
  it("preserves the original text and timing", () => {
    const exercise = generateExerciseLine(LINE, {
      lineIndex: 2,
      hide: 1,
      mode: "typing",
      seed: "song-1:line-2",
    })

    expect(exercise.lineIndex).toBe(2)
    expect(exercise.start).toBe(10)
    expect(exercise.end).toBe(14)
    expect(exercise.text).toBe(LINE.text)
    expect(exercise.tokens.map((t) => t.raw)).toEqual([
      "The", "brave", "fox", "jumped", "quickly,", "oohh!",
    ])
  })

  it("never hides the interjection token even on expert", () => {
    const exercise = generateExerciseLine(LINE, {
      lineIndex: 0,
      hide: "all",
      mode: "typing",
      seed: "seed-1",
    })

    const oohhToken = exercise.tokens.find((t) => t.raw === "oohh!")
    expect(oohhToken?.isHidden).toBe(false)
  })

  it("forces typing mode on expert regardless of requested mode", () => {
    const exercise = generateExerciseLine(LINE, {
      lineIndex: 0,
      hide: "all",
      mode: "multipleChoice",
      seed: "seed-1",
    })

    expect(exercise.mode).toBe("typing")
  })

  it("attaches choices to hidden tokens in multiple-choice mode", () => {
    const exercise = generateExerciseLine(LINE, {
      lineIndex: 0,
      hide: 2,
      mode: "multipleChoice",
      seed: "seed-1",
      distractorPool: ["mountain", "river", "castle", "forest", "shadow"],
    })

    const hiddenTokens = exercise.tokens.filter((t) => t.isHidden)
    expect(hiddenTokens.length).toBeGreaterThan(0)

    for (const token of hiddenTokens) {
      expect(token.choices).toBeDefined()
      expect(token.choices).toContain(token.answer)
      expect(new Set(token.choices).size).toBe(token.choices?.length)
    }
  })

  it("does not attach choices in typing mode", () => {
    const exercise = generateExerciseLine(LINE, {
      lineIndex: 0,
      hide: 2,
      mode: "typing",
      seed: "seed-1",
    })

    for (const token of exercise.tokens) {
      expect(token.choices).toBeUndefined()
    }
  })

  it("is deterministic: same line + same seed = same exercise", () => {
    const options = {
      lineIndex: 0,
      hide: 2,
      mode: "multipleChoice" as const,
      seed: "song-7:line-0",
      distractorPool: ["mountain", "river", "castle", "forest"],
    }

    const first = generateExerciseLine(LINE, options)
    const second = generateExerciseLine(LINE, options)

    expect(first).toEqual(second)
  })
})

describe("generateExerciseLine in word-bank mode", () => {
  it("hides words without per-blank choices: the bank is built from the song, not the line", () => {
    const exercise = generateExerciseLine(LINE, { lineIndex: 0, hide: 2, mode: "wordBank", seed: "s" })

    expect(exercise.mode).toBe("wordBank")
    expect(exercise.tokens.filter((t) => t.isHidden)).toHaveLength(2)
    for (const token of exercise.tokens) expect(token.choices).toBeUndefined()
  })

  it("is still forced to typing when every word is hidden", () => {
    expect(generateExerciseLine(LINE, { lineIndex: 0, hide: "all", mode: "wordBank", seed: "s" }).mode).toBe("typing")
  })
})

const BEGINNER_1: Level = { difficulty: "beginner", stage: 1 }
const ADVANCED_3: Level = { difficulty: "advanced", stage: 3 }
const EXPERT: Level = { difficulty: "expert", stage: 1 }

describe("generateSongExercises", () => {
  // 5-second lines: exactly one blank per line at beginner 1 (one blank per 5s).
  const CHORUS_LINE: LyricLine = { start: 0, end: 5, text: "so sing river mountain ocean forest" }
  const chorus = (length: number) =>
    Array.from({ length }, (_, i) => ({ ...CHORUS_LINE, start: i * 5, end: i * 5 + 5 }))
  const hiddenAnswers = (exercise: ReturnType<typeof generateSongExercises>[number]) =>
    exercise.tokens.filter((t) => t.isHidden).map((t) => t.answer)

  it("hides a different word each time a chorus line repeats, until the line runs out of new ones", () => {
    const answers = generateSongExercises(chorus(4), { level: BEGINNER_1, mode: "typing", seedPrefix: "song-1:s" }).flatMap(
      hiddenAnswers,
    )

    expect(answers).toHaveLength(4)
    expect(new Set(answers).size).toBe(4)
  })

  it("repeats a word only once every candidate on the line has been used", () => {
    const answers = generateSongExercises(chorus(6), { level: BEGINNER_1, mode: "typing", seedPrefix: "song-1:s" }).flatMap(
      hiddenAnswers,
    )

    expect(answers).toHaveLength(6)
    expect(new Set(answers.slice(0, 4)).size).toBe(4)
  })

  it("hides as many words per line as the level's pace allocates", () => {
    const lines = chorus(5)
    const song = generateSongExercises(lines, { level: ADVANCED_3, mode: "typing", seedPrefix: "x" })

    expect(song.map((exercise) => hiddenAnswers(exercise).length)).toEqual(blanksPerLine(lines, ADVANCED_3))
  })

  it("hides every eligible word on expert, leading words included, and forces typing", () => {
    const song = generateSongExercises(chorus(1), { level: EXPERT, mode: "multipleChoice", seedPrefix: "x" })

    expect(song[0].mode).toBe("typing")
    expect(hiddenAnswers(song[0])).toContain("sing")
  })

  it("numbers lines by their position in the song", () => {
    const exercises = generateSongExercises(chorus(2), { level: BEGINNER_1, mode: "typing", seedPrefix: "s" })

    expect(exercises.map((e) => e.lineIndex)).toEqual([0, 1])
  })

  it("is deterministic for the same seed prefix", () => {
    const options = { level: ADVANCED_3, mode: "typing" as const, seedPrefix: "same" }

    expect(generateSongExercises(chorus(2), options)).toEqual(generateSongExercises(chorus(2), options))
  })
})

describe("estimateHiddenWordCounts", () => {
  const song: LyricLine[] = Array.from({ length: 12 }, (_, i) => ({
    start: i * 6,
    end: i * 6 + 6,
    text: "we keep running through the empty city streets tonight",
  }))

  it("never hides fewer words at a harder level", () => {
    const counts = estimateHiddenWordCounts(song)
    const ordered = LEVELS.map((level) => counts[levelId(level)])

    for (let i = 1; i < ordered.length; i++) expect(ordered[i]).toBeGreaterThanOrEqual(ordered[i - 1])
  })

  it("matches what the game actually hides", () => {
    const counts = estimateHiddenWordCounts(song)

    for (const level of LEVELS) {
      const hidden = generateSongExercises(song, { level, mode: "typing", seedPrefix: "p" }).reduce(
        (sum, exercise) => sum + exercise.tokens.filter((t) => t.isHidden).length,
        0,
      )
      expect(hidden).toBe(counts[levelId(level)])
    }
  })
})
