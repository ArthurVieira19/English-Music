import { describe, expect, it } from "vitest"
import {
  LEVELS,
  PROMOTION_STARS,
  firstLevelOf,
  hidesEveryWord,
  levelId,
  levelLabel,
  nextLevel,
  offeredLevel,
  parseLevelId,
  promotionAfter,
  resolveCurrentLevel,
  secondsPerBlank,
  type Level,
} from "./levels"

const b1: Level = { difficulty: "beginner", stage: 1 }
const b3: Level = { difficulty: "beginner", stage: 3 }
const i1: Level = { difficulty: "intermediate", stage: 1 }
const i2: Level = { difficulty: "intermediate", stage: 2 }
const a3: Level = { difficulty: "advanced", stage: 3 }
const expert: Level = { difficulty: "expert", stage: 1 }

describe("level ladder", () => {
  it("has ten levels, easiest first, ending on expert", () => {
    expect(LEVELS).toHaveLength(10)
    expect(LEVELS[0]).toEqual(b1)
    expect(LEVELS.at(-1)).toEqual(expert)
  })

  it("asks for a blank more often at every step up", () => {
    const rates = LEVELS.slice(0, -1).map(secondsPerBlank)

    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1])
  })

  it("hides every word only on expert", () => {
    expect(hidesEveryWord(expert)).toBe(true)
    expect(LEVELS.slice(0, -1).some(hidesEveryWord)).toBe(false)
  })

  it("labels stages, but not the single expert level", () => {
    expect(levelLabel(i2)).toBe("Intermediate 2")
    expect(levelLabel(expert)).toBe("Expert")
  })
})

describe("level ids", () => {
  it("round-trip", () => {
    for (const level of LEVELS) expect(parseLevelId(levelId(level))).toEqual(level)
  })

  it("reject anything that isn't a real level", () => {
    expect(parseLevelId("expert-2")).toBeNull()
    expect(parseLevelId("beginner-4")).toBeNull()
    expect(parseLevelId("")).toBeNull()
    expect(parseLevelId(undefined)).toBeNull()
  })
})

describe("nextLevel", () => {
  it("steps through stages, then into the next tier", () => {
    expect(nextLevel(b1)).toEqual({ difficulty: "beginner", stage: 2 })
    expect(nextLevel(b3)).toEqual(i1)
    expect(nextLevel(a3)).toEqual(expert)
  })

  it("has nowhere to go from expert", () => {
    expect(nextLevel(expert)).toBeNull()
  })
})

describe("resolveCurrentLevel", () => {
  it("uses the saved level", () => {
    expect(resolveCurrentLevel("intermediate-2", "beginner")).toEqual(i2)
  })

  it("falls back to stage 1 of the last chosen tier", () => {
    expect(resolveCurrentLevel(undefined, "intermediate")).toEqual(i1)
    expect(resolveCurrentLevel("garbage", "advanced")).toEqual(firstLevelOf("advanced"))
  })
})

describe("offeredLevel", () => {
  it("offers the player's own stage in their tier", () => {
    expect(offeredLevel("intermediate", i2)).toEqual(i2)
  })

  it("offers the top stage of easier tiers and the first stage of harder ones", () => {
    expect(offeredLevel("beginner", i2)).toEqual(b3)
    expect(offeredLevel("advanced", i2)).toEqual({ difficulty: "advanced", stage: 1 })
    expect(offeredLevel("expert", i2)).toEqual(expert)
  })
})

describe("promotionAfter", () => {
  it("moves a player up one step after a strong run at their level", () => {
    expect(promotionAfter(i1, i1, PROMOTION_STARS)).toEqual(i2)
    expect(promotionAfter(b3, b3, 5)).toEqual(i1)
  })

  it("needs enough stars", () => {
    expect(promotionAfter(i1, i1, PROMOTION_STARS - 0.5)).toBeNull()
  })

  it("does not promote for an easy win below the player's level", () => {
    expect(promotionAfter(b1, i2, 5)).toBeNull()
  })

  it("promotes past the played level when the player beat a harder one", () => {
    expect(promotionAfter(a3, i1, 4.5)).toEqual(expert)
  })

  it("never moves anyone down", () => {
    expect(promotionAfter(i1, i2, 0)).toBeNull()
  })

  it("has nothing above expert", () => {
    expect(promotionAfter(expert, expert, 5)).toBeNull()
  })
})
