import { describe, expect, it } from "vitest"
import {
  COMBO_STREAK_CAP,
  MAX_POINTS_PER_BLANK,
  MAX_STARS,
  calculateAccuracy,
  calculateCompletion,
  calculateComboBonus,
  calculateMaxScore,
  calculateParScore,
  calculateSpeedBonus,
  calculateStars,
  scoreAnswer,
} from "./scoreEngine"

describe("calculateSpeedBonus", () => {
  it("gives max bonus for an instant answer", () => {
    expect(calculateSpeedBonus(0, 5000)).toBe(50)
  })

  it("gives zero bonus when the full time limit is used", () => {
    expect(calculateSpeedBonus(5000, 5000)).toBe(0)
  })

  it("gives roughly half the bonus at half the time limit", () => {
    expect(calculateSpeedBonus(2500, 5000)).toBe(25)
  })

  it("never goes negative when the answer arrives late", () => {
    expect(calculateSpeedBonus(9000, 5000)).toBe(0)
  })

  it("returns 0 when there is no time limit", () => {
    expect(calculateSpeedBonus(100, 0)).toBe(0)
  })
})

describe("calculateComboBonus", () => {
  it("scales linearly with combo count", () => {
    expect(calculateComboBonus(0)).toBe(0)
    expect(calculateComboBonus(1)).toBe(10)
    expect(calculateComboBonus(5)).toBe(50)
  })

  it("stops growing once the streak cap is reached", () => {
    const atCap = calculateComboBonus(COMBO_STREAK_CAP)

    expect(atCap).toBe(COMBO_STREAK_CAP * 10)
    expect(calculateComboBonus(COMBO_STREAK_CAP + 1)).toBe(atCap)
    expect(calculateComboBonus(500)).toBe(atCap)
  })

  it("treats a negative combo as no combo", () => {
    expect(calculateComboBonus(-3)).toBe(0)
  })
})

describe("calculateMaxScore", () => {
  it("is zero for a song with no blanks", () => {
    expect(calculateMaxScore(0)).toBe(0)
    expect(calculateMaxScore(-4)).toBe(0)
  })

  it("is the per-blank ceiling times the number of blanks", () => {
    expect(MAX_POINTS_PER_BLANK).toBe(250)
    expect(calculateMaxScore(3)).toBe(750)
  })

  it("grows linearly with the number of blanks", () => {
    expect(calculateMaxScore(200) - calculateMaxScore(100)).toBe(100 * MAX_POINTS_PER_BLANK)
  })

  it("is never beaten by the score engine, even with the combo at its ceiling from the start", () => {
    let total = 0
    for (let i = 0; i < 40; i++) {
      total += scoreAnswer({ isCorrect: true, responseTimeMs: 0, timeLimitMs: 5000, combo: 500 }).points
    }

    expect(total).toBe(calculateMaxScore(40))
  })

  it("is above the par score, which a first playthrough is measured against", () => {
    expect(calculateMaxScore(30)).toBeGreaterThan(calculateParScore(30))
  })
})

describe("calculateStars", () => {
  it("gives no stars for no score or no blanks", () => {
    expect(calculateStars(0, 20)).toBe(0)
    expect(calculateStars(500, 0)).toBe(0)
  })

  it("rates a flawless average-pace run at the maximum", () => {
    expect(calculateStars(calculateParScore(30), 30)).toBe(MAX_STARS)
  })

  it("never exceeds the maximum, even for a faster-than-par run", () => {
    expect(calculateStars(calculateMaxScore(30), 30)).toBe(MAX_STARS)
  })

  it("moves in half-star steps", () => {
    const par = calculateParScore(30)

    expect(calculateStars(par * 0.5, 30)).toBe(2.5)
    expect(calculateStars(par * 0.29, 30)).toBe(1)
    expect(calculateStars(par * 0.31, 30)).toBe(1.5)
  })

  it("rates the same fraction of par the same on a short song and a long one", () => {
    // 0.65 sits mid-step, so floating-point noise can't tip one song into a different half-star.
    expect(calculateStars(calculateParScore(8) * 0.65, 8)).toBe(calculateStars(calculateParScore(120) * 0.65, 120))
  })
})

describe("scoreAnswer", () => {
  it("awards base + speed + combo points on a correct answer", () => {
    const result = scoreAnswer({ isCorrect: true, responseTimeMs: 0, timeLimitMs: 5000, combo: 2 })

    expect(result.baseScore).toBe(100)
    expect(result.speedBonus).toBe(50)
    expect(result.newCombo).toBe(3)
    expect(result.comboBonus).toBe(30)
    expect(result.points).toBe(180)
  })

  it("resets combo and awards nothing on a wrong answer", () => {
    const result = scoreAnswer({ isCorrect: false, responseTimeMs: 1000, timeLimitMs: 5000, combo: 7 })

    expect(result.points).toBe(0)
    expect(result.newCombo).toBe(0)
  })

  it("awards half the points when the correct answer took a second attempt", () => {
    const first = scoreAnswer({ isCorrect: true, responseTimeMs: 0, timeLimitMs: 5000, combo: 2, attempt: 1 })
    const second = scoreAnswer({ isCorrect: true, responseTimeMs: 0, timeLimitMs: 5000, combo: 2, attempt: 2 })

    expect(first.points).toBe(180)
    expect(second.points).toBe(90)
    expect(second.baseScore).toBe(50)
    expect(second.speedBonus).toBe(25)
    expect(second.comboBonus).toBe(15)
  })

  it("keeps the combo going on a second-attempt hit", () => {
    const result = scoreAnswer({ isCorrect: true, responseTimeMs: 0, timeLimitMs: 5000, combo: 2, attempt: 2 })

    expect(result.newCombo).toBe(3)
  })

  it("treats an omitted attempt as the first attempt", () => {
    const input = { isCorrect: true, responseTimeMs: 1000, timeLimitMs: 5000, combo: 0 }

    expect(scoreAnswer(input)).toEqual(scoreAnswer({ ...input, attempt: 1 }))
  })

  it("is a pure function: same input always yields same output", () => {
    const input = { isCorrect: true, responseTimeMs: 1200, timeLimitMs: 4000, combo: 4 }
    expect(scoreAnswer(input)).toEqual(scoreAnswer(input))
  })
})

describe("calculateAccuracy", () => {
  it("computes a percentage with 2 decimals", () => {
    expect(calculateAccuracy(1, 3)).toBeCloseTo(33.33, 2)
  })

  it("returns 0 when there are no answers", () => {
    expect(calculateAccuracy(0, 0)).toBe(0)
  })

  it("returns 100 for a perfect run", () => {
    expect(calculateAccuracy(10, 10)).toBe(100)
  })
})

describe("calculateCompletion", () => {
  it("computes a percentage of exercises answered", () => {
    expect(calculateCompletion(5, 10)).toBe(50)
  })

  it("returns 0 when there are no exercises", () => {
    expect(calculateCompletion(0, 0)).toBe(0)
  })
})
