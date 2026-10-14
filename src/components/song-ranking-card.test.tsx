// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ScoreSubmissionState, SongScoreEntry } from "@/modules/leaderboard/songScores"
import type { SongBoardResult } from "@/services/leaderboard/songScoreService"
import { SongRankingCard } from "./song-ranking-card"

const loadBoard = vi.fn<(...args: unknown[]) => Promise<SongBoardResult>>()

vi.mock("@/services/leaderboard/songScoreService", () => ({
  songScoreService: { loadBoard: (...args: unknown[]) => loadBoard(...args) },
}))

function entry(overrides: Partial<SongScoreEntry>): SongScoreEntry {
  return {
    place: 1,
    userId: "u1",
    displayName: "Ana",
    level: 3,
    score: 2400,
    accuracy: 96,
    isMe: false,
    ...overrides,
  }
}

const saved = (overrides: { place?: number; bestScore?: number; isNewBest?: boolean } = {}): ScoreSubmissionState => ({
  status: "saved",
  submission: { place: 2, bestScore: 1800, isNewBest: true, ...overrides },
})

function renderCard(submission: ScoreSubmissionState | null) {
  return render(<SongRankingCard songId="song-1" difficulty="advanced" mode="typing" submission={submission} />)
}

beforeEach(() => {
  loadBoard.mockReset()
})

describe("SongRankingCard", () => {
  it("draws nothing before a game has finished", () => {
    const { container } = renderCard(null)

    expect(container).toBeEmptyDOMElement()
  })

  it("draws nothing when the score was not ranked", () => {
    const { container } = renderCard({ status: "skipped" })

    expect(container).toBeEmptyDOMElement()
    expect(loadBoard).not.toHaveBeenCalled()
  })

  it("shows a placeholder while the score is still being submitted, without fetching the board yet", () => {
    renderCard({ status: "pending" })

    expect(screen.getByRole("region", { name: "Song ranking" })).toBeInTheDocument()
    expect(loadBoard).not.toHaveBeenCalled()
  })

  it("loads the board for the song, difficulty and mode that were played", async () => {
    loadBoard.mockResolvedValue({ ok: true, entries: [entry({})] })
    renderCard(saved())

    await screen.findByText("Ana")
    expect(loadBoard).toHaveBeenCalledWith("song-1", "advanced", "typing")
  })

  it("announces a new personal best with the player's place", async () => {
    loadBoard.mockResolvedValue({ ok: true, entries: [entry({ place: 2, isMe: true, displayName: "Me", score: 1800 })] })
    renderCard(saved({ place: 2, isNewBest: true }))

    expect(await screen.findByText("You're 2nd on this song")).toBeInTheDocument()
    expect(screen.getByText(/new personal best/)).toBeInTheDocument()
  })

  it("explains that an older, higher score still stands when this run was not a best", async () => {
    loadBoard.mockResolvedValue({ ok: true, entries: [entry({ place: 3, isMe: true, displayName: "Me" })] })
    renderCard(saved({ place: 3, bestScore: 2100, isNewBest: false }))

    expect(await screen.findByText("Your best puts you 3rd")).toBeInTheDocument()
    expect(screen.getByText(/best 2,100/)).toBeInTheDocument()
  })

  it("highlights the player's own row and lists the others", async () => {
    loadBoard.mockResolvedValue({
      ok: true,
      entries: [entry({ place: 1 }), entry({ place: 2, userId: "me", displayName: "Me", isMe: true, score: 1800 })],
    })
    renderCard(saved())

    const mine = await screen.findByLabelText(/2nd: Me \(you\)/)
    expect(mine).toHaveClass("bg-secondary/10")
    expect(screen.getByLabelText(/1st: Ana/)).not.toHaveClass("bg-secondary/10")
  })

  it("separates the player's own row when it is below the shown board", async () => {
    loadBoard.mockResolvedValue({
      ok: true,
      entries: [entry({ place: 1 }), entry({ place: 14, userId: "me", displayName: "Me", isMe: true })],
    })
    renderCard(saved({ place: 14 }))

    await screen.findByLabelText(/14th: Me/)
    expect(screen.getByText("⋯")).toBeInTheDocument()
  })

  it("hides itself when the server has not been set up for ranking", async () => {
    loadBoard.mockResolvedValue({ ok: false, reason: "not-set-up" })
    const { container } = renderCard(saved())

    await vi.waitFor(() => expect(loadBoard).toHaveBeenCalled())
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it("hides itself when the board cannot be loaded", async () => {
    loadBoard.mockResolvedValue({ ok: false, reason: "unavailable" })
    const { container } = renderCard(saved())

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
