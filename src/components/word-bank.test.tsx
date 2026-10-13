// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ExerciseLine } from "@/types/ExerciseLine"
import { WordBank } from "./word-bank"

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
      const word = raw.replace(/[[\]]/g, "")
      return raw.startsWith("[")
        ? { index, raw: word, isHidden: true, answer: word }
        : { index, raw: word, isHidden: false }
    }),
  }
}

const SONG = [line(0, "I [Walk] the [line]"), line(1, "keep my [eyes] [wide] open"), line(2, "all the [time]")]

/** The bank's positions in order; an empty position reads as "". */
function bankWords() {
  return Array.from(screen.getByRole("group", { name: "Word bank" }).children).map((slot) => slot.textContent)
}

describe("WordBank", () => {
  it("offers the upcoming answers, lowercased so capitals give nothing away", () => {
    render(<WordBank exercises={SONG} lineIndex={0} answeredTokens={{}} seed={1} onPick={vi.fn()} />)

    expect(bankWords().filter(Boolean).sort()).toEqual(["eyes", "line", "time", "walk", "wide"])
  })

  it("answers the first open blank of the current line with the picked word", async () => {
    const onPick = vi.fn()
    render(<WordBank exercises={SONG} lineIndex={0} answeredTokens={{}} seed={1} onPick={onPick} />)

    await userEvent.click(screen.getByRole("button", { name: "eyes" }))

    expect(onPick).toHaveBeenCalledWith(1, "eyes")
  })

  it("moves on to the next blank once one is answered", async () => {
    const onPick = vi.fn()
    render(<WordBank exercises={SONG} lineIndex={0} answeredTokens={{ "0:1": true }} seed={1} onPick={onPick} />)

    await userEvent.click(screen.getByRole("button", { name: "line" }))

    expect(onPick).toHaveBeenCalledWith(3, "line")
  })

  it("rules out a word already guessed wrong for this blank", () => {
    render(
      <WordBank
        exercises={SONG}
        lineIndex={0}
        answeredTokens={{}}
        wrongGuesses={{ "0:1": ["Eyes"] }}
        seed={1}
        onPick={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "eyes" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "walk" })).toBeEnabled()
  })

  it("waits, disabled, while the current line has nothing to answer", () => {
    render(<WordBank exercises={SONG} lineIndex={0} answeredTokens={{ "0:1": true, "0:3": true }} seed={1} onPick={vi.fn()} />)

    expect(screen.getByText("Coming up next…")).toBeInTheDocument()
    for (const button of within(screen.getByRole("group", { name: "Word bank" })).getAllByRole("button")) {
      expect(button).toBeDisabled()
    }
  })

  it("keeps a word on its button when another word is used up", () => {
    const { rerender } = render(<WordBank exercises={SONG} lineIndex={0} answeredTokens={{}} seed={3} onPick={vi.fn()} />)
    const before = bankWords()
    const lineSlot = before.indexOf("line")

    rerender(<WordBank exercises={SONG} lineIndex={0} answeredTokens={{ "0:1": true }} seed={3} onPick={vi.fn()} />)

    expect(bankWords().indexOf("line")).toBe(lineSlot)
    expect(bankWords()).not.toContain("walk")
  })

  it("draws nothing once every blank is answered", () => {
    const all = { "0:1": true, "0:3": true, "1:2": true, "1:3": true, "2:2": true }
    const { container } = render(<WordBank exercises={SONG} lineIndex={2} answeredTokens={all} seed={1} onPick={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
