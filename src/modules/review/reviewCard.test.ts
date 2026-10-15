import { describe, expect, it } from "vitest"
import { buildReviewCard } from "./reviewCard"

describe("buildReviewCard", () => {
  it("blanks every occurrence of the word, not just the first", () => {
    const { tokens, blankIndices } = buildReviewCard("I love you baby and I love you always", "love")

    expect(tokens).toHaveLength(9)
    expect([...blankIndices].sort((a, b) => a - b)).toEqual([1, 6])
  })

  it("matches regardless of case and surrounding punctuation", () => {
    const { tokens, blankIndices } = buildReviewCard("Love, love — LOVE!", "love")

    expect(tokens).toHaveLength(4)
    // The em dash is its own token and must not be blanked.
    expect([...blankIndices].sort((a, b) => a - b)).toEqual([0, 1, 3])
  })

  it("returns no blanks when the word isn't present in the context line", () => {
    const { blankIndices } = buildReviewCard("Something else entirely", "love")
    expect(blankIndices.size).toBe(0)
  })

  it("does not blank a word that merely contains the answer", () => {
    const { blankIndices } = buildReviewCard("She is lovely and beloved", "love")
    expect(blankIndices.size).toBe(0)
  })

  it("blanks several missed words in one line and says which blank is which", () => {
    const { blankIndices, blankWords } = buildReviewCard("Take me to the river, take me home", ["river", "home", "take"])

    expect([...blankIndices].sort((a, b) => a - b)).toEqual([0, 4, 5, 7]) // "Take" "river," "take" "home"
    expect(blankWords.get(0)).toBe("take")
    expect(blankWords.get(4)).toBe("river")
    expect(blankWords.get(7)).toBe("home")
  })
})
