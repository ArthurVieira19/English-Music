import { beforeEach, describe, expect, it } from "vitest"
import { answeredTokenKey, useGameStore } from "./gameStore"

const KEY = answeredTokenKey(0, 2)

describe("gameStore attempts", () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it("records wrong guesses without scoring or revealing the blank", () => {
    useGameStore.getState().recordWrongGuess(0, 2, "dog")

    const state = useGameStore.getState()
    expect(state.wrongGuesses[KEY]).toEqual(["dog"])
    expect(state.answeredTokens).toEqual({})
    expect(state.totalAnswers).toBe(0)
    expect(state.score).toBe(0)
  })

  it("clears the wrong guesses once the blank is resolved", () => {
    const { recordWrongGuess, applyAnswer } = useGameStore.getState()
    recordWrongGuess(0, 2, "dog")
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 50, isCorrect: true, newCombo: 1 })

    const state = useGameStore.getState()
    expect(state.wrongGuesses[KEY]).toBeUndefined()
    expect(state.answeredTokens[KEY]).toBe(true)
    expect(state.score).toBe(50)
    expect(state.totalAnswers).toBe(1)
  })

  it("gives a fresh set of attempts when an open blank is reset", () => {
    const { recordWrongGuess, unanswerToken } = useGameStore.getState()
    recordWrongGuess(0, 2, "dog")
    unanswerToken(0, 2)

    expect(useGameStore.getState().wrongGuesses[KEY]).toBeUndefined()
    expect(useGameStore.getState().totalAnswers).toBe(0)
  })

  it("only takes an answered blank off the answer count when it is reset", () => {
    const { applyAnswer, unanswerToken } = useGameStore.getState()
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 0, isCorrect: false, newCombo: 0 })
    applyAnswer({ exerciseIndex: 0, tokenIndex: 3, points: 0, isCorrect: false, newCombo: 0 })
    unanswerToken(0, 2)

    const state = useGameStore.getState()
    expect(state.totalAnswers).toBe(1)
    expect(KEY in state.answeredTokens).toBe(false)
  })
})

describe("gameStore redoing a line", () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it("takes the old points back when an answered blank is reset", () => {
    const { applyAnswer, unanswerToken } = useGameStore.getState()
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 180, isCorrect: true, newCombo: 1 })
    applyAnswer({ exerciseIndex: 0, tokenIndex: 3, points: 90, isCorrect: true, newCombo: 2 })
    unanswerToken(0, 2)

    const state = useGameStore.getState()
    expect(state.score).toBe(90)
    expect(state.correctAnswers).toBe(1)
    expect(state.totalAnswers).toBe(1)
    expect(state.tokenPoints[KEY]).toBeUndefined()
  })

  it("cannot pile up score by re-answering the same blank", () => {
    const { applyAnswer, unanswerToken } = useGameStore.getState()

    for (let round = 0; round < 5; round++) {
      applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 150, isCorrect: true, newCombo: round + 1 })
      unanswerToken(0, 2)
    }
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 150, isCorrect: true, newCombo: 6 })

    const state = useGameStore.getState()
    expect(state.score).toBe(150)
    expect(state.correctAnswers).toBe(1)
    expect(state.totalAnswers).toBe(1)
  })

  it("keeps accuracy at or below 100% after redoing a correct blank", () => {
    const { applyAnswer, unanswerToken } = useGameStore.getState()
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 100, isCorrect: true, newCombo: 1 })
    unanswerToken(0, 2)
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 100, isCorrect: true, newCombo: 2 })

    const { correctAnswers, totalAnswers } = useGameStore.getState()
    expect(correctAnswers).toBeLessThanOrEqual(totalAnswers)
  })

  it("lets a missed blank be redone for a better result", () => {
    const { applyAnswer, unanswerToken } = useGameStore.getState()
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 0, isCorrect: false, newCombo: 0 })
    unanswerToken(0, 2)
    applyAnswer({ exerciseIndex: 0, tokenIndex: 2, points: 100, isCorrect: true, newCombo: 1 })

    const state = useGameStore.getState()
    expect(state.score).toBe(100)
    expect(state.correctAnswers).toBe(1)
    expect(state.totalAnswers).toBe(1)
  })

  it("does not change the score when resetting a blank that was never answered", () => {
    const { applyAnswer, unanswerToken } = useGameStore.getState()
    applyAnswer({ exerciseIndex: 0, tokenIndex: 3, points: 120, isCorrect: true, newCombo: 1 })
    unanswerToken(0, 2)

    expect(useGameStore.getState().score).toBe(120)
  })
})
