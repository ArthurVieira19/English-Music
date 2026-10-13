import { describe, expect, it } from "vitest"
import { effectiveScoreMode, isBelowBoard, parseSongScoreRows, parseSubmissionRow } from "./songScores"

const ROW = {
  place: 1,
  user_id: "u1",
  display_name: "Ana",
  level: 4,
  score: 2400,
  accuracy: 96.5,
  is_me: false,
}

describe("effectiveScoreMode", () => {
  it("keeps the chosen mode below expert", () => {
    expect(effectiveScoreMode("beginner", "multipleChoice")).toBe("multipleChoice")
    expect(effectiveScoreMode("advanced", "typing")).toBe("typing")
  })

  it("scores expert on the typing board whatever mode was picked", () => {
    expect(effectiveScoreMode("expert", "multipleChoice")).toBe("typing")
  })
})

describe("parseSongScoreRows", () => {
  it("maps a well-formed row", () => {
    expect(parseSongScoreRows([ROW])).toEqual([
      { place: 1, userId: "u1", displayName: "Ana", level: 4, score: 2400, accuracy: 96.5, isMe: false },
    ])
  })

  it("accepts the numeric strings Postgres sends for bigint and numeric columns", () => {
    const [entry] = parseSongScoreRows([{ ...ROW, place: "3", score: "1800", accuracy: "88.25", level: "2" }])

    expect(entry).toMatchObject({ place: 3, score: 1800, accuracy: 88.25, level: 2 })
  })

  it("drops malformed rows instead of throwing", () => {
    const rows = [null, "x", { ...ROW, user_id: 7 }, { ...ROW, score: "NaN" }, { ...ROW, place: undefined }, ROW]

    expect(parseSongScoreRows(rows)).toHaveLength(1)
  })

  it("falls back to safe defaults for a missing name, level or accuracy", () => {
    const [entry] = parseSongScoreRows([{ ...ROW, display_name: "  ", level: 0, accuracy: null }])

    expect(entry).toMatchObject({ displayName: "Player", level: 1, accuracy: 0 })
  })

  it("keeps accuracy inside 0-100", () => {
    const [over, under] = parseSongScoreRows([{ ...ROW, accuracy: 140 }, { ...ROW, user_id: "u2", accuracy: -5 }])

    expect(over.accuracy).toBe(100)
    expect(under.accuracy).toBe(0)
  })

  it("returns nothing for a non-array response", () => {
    expect(parseSongScoreRows(null)).toEqual([])
    expect(parseSongScoreRows({ place: 1 })).toEqual([])
  })

  it("marks the caller's own row", () => {
    expect(parseSongScoreRows([{ ...ROW, is_me: true }])[0].isMe).toBe(true)
  })
})

describe("parseSubmissionRow", () => {
  const SUBMISSION = { out_place: 2, out_best_score: 1500, out_is_new_best: true }

  it("reads the first row of an array response", () => {
    expect(parseSubmissionRow([SUBMISSION])).toEqual({ place: 2, bestScore: 1500, isNewBest: true })
  })

  it("reads a bare object response", () => {
    expect(parseSubmissionRow(SUBMISSION)).toEqual({ place: 2, bestScore: 1500, isNewBest: true })
  })

  it("accepts numeric strings", () => {
    expect(parseSubmissionRow([{ ...SUBMISSION, out_place: "5" }])?.place).toBe(5)
  })

  it("reports isNewBest as false when the server says so", () => {
    expect(parseSubmissionRow([{ ...SUBMISSION, out_is_new_best: false }])?.isNewBest).toBe(false)
  })

  it("returns null for an empty or malformed response", () => {
    expect(parseSubmissionRow([])).toBeNull()
    expect(parseSubmissionRow(null)).toBeNull()
    expect(parseSubmissionRow([{ out_place: "x", out_best_score: 1 }])).toBeNull()
  })
})

describe("isBelowBoard", () => {
  const me = parseSongScoreRows([{ ...ROW, is_me: true, place: 14 }])[0]

  it("flags the caller's own row past the board size", () => {
    expect(isBelowBoard(me, 10)).toBe(true)
  })

  it("does not flag it inside the board, or any other player's row", () => {
    expect(isBelowBoard({ ...me, place: 4 }, 10)).toBe(false)
    expect(isBelowBoard({ ...me, isMe: false }, 10)).toBe(false)
  })
})
