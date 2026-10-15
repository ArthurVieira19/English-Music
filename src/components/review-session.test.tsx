// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ReviewSession } from "./review-session"
import { useLibraryStore } from "@/stores/libraryStore"
import { useReviewStore } from "@/stores/reviewStore"
import { useStatsStore } from "@/stores/statsStore"
import { DEFAULT_PROGRESS, DEFAULT_STATISTICS } from "@/services/storage/storageService"
import type { Song } from "@/types/Song"
import type { WeakWord, WeakWordClip } from "@/types/WeakWord"

// The real player talks to YouTube; here it only reports what it was asked to play.
vi.mock("@/components/review-clip-player", () => ({
  ReviewClipPlayer: (props: { youtubeId: string; clip: { start: number; end: number }; playKey: string | number }) => (
    <div
      data-testid="clip-player"
      data-youtube={props.youtubeId}
      data-clip={`${props.clip.start}-${props.clip.end}`}
      data-playkey={props.playKey}
    />
  ),
}))

const SONG: Song = {
  id: "s1",
  title: "Song",
  artist: "Artist",
  youtubeId: "yt-1",
  thumbnail: "",
  difficulty: "beginner",
  lyrics: [
    { start: 10, end: 13, text: "we sing river mountain" },
    { start: 13, end: 16, text: "ocean forest wide open" },
  ],
}

function weakWord(word: string, contextText: string, clip?: WeakWordClip): WeakWord {
  return {
    word,
    songId: "s1",
    songTitle: "Song",
    artist: "Artist",
    contextText,
    ...(clip ? { clip } : {}),
    timesWrong: 1,
    timesCorrect: 0,
    intervalIndex: 0,
    lastSeenAt: 0,
    nextReviewAt: 0,
  }
}

function answer(value: string) {
  fireEvent.change(screen.getByLabelText("Missing word"), { target: { value } })
  fireEvent.click(screen.getByRole("button", { name: "Check" }))
}

beforeEach(() => {
  localStorage.clear()
  useReviewStore.setState({ weakWords: [] })
  useLibraryStore.setState({ songs: [] })
  useStatsStore.setState({ statistics: DEFAULT_STATISTICS, progress: DEFAULT_PROGRESS })
})

describe("ReviewSession", () => {
  it("explains a recognised mistake and waits for Continue instead of auto-advancing", () => {
    vi.useFakeTimers()
    const onFinish = vi.fn()
    render(<ReviewSession words={[weakWord("there", "I left my keys over there")]} onFinish={onFinish} />)

    answer("their")

    expect(screen.getByText(/sound exactly the same/i)).toBeInTheDocument()
    vi.advanceTimersByTime(5000)
    expect(onFinish).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("still auto-advances after a wrong answer that has nothing more to explain", () => {
    vi.useFakeTimers()
    const onFinish = vi.fn()
    render(<ReviewSession words={[weakWord("heart", "You have my whole heart")]} onFinish={onFinish} />)

    answer("table")

    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument()
    vi.advanceTimersByTime(1300)
    expect(onFinish).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("counts the day toward the streak on the first answer, even if the deck is never finished", () => {
    render(
      <ReviewSession
        words={[weakWord("there", "over there"), weakWord("heart", "my heart")]}
        onFinish={() => {}}
      />,
    )
    expect(useStatsStore.getState().progress.activityDays).toHaveLength(0)

    answer("there")

    expect(useStatsStore.getState().progress.activityDays).toHaveLength(1)
    expect(useStatsStore.getState().statistics.currentStreak).toBe(1)
  })

  describe("I don't know", () => {
    const giveUp = () => fireEvent.click(screen.getByRole("button", { name: "I don't know" }))

    it("shows the answer and waits for Continue, even when there is nothing to explain", () => {
      vi.useFakeTimers()
      const onFinish = vi.fn()
      render(<ReviewSession words={[weakWord("heart", "You have my whole heart")]} onFinish={onFinish} />)

      giveUp()

      expect(screen.getByText(/It was/)).toHaveTextContent("heart")
      vi.advanceTimersByTime(5000)
      expect(onFinish).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole("button", { name: "Continue" }))
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ totalReviewed: 1, correctCount: 0 }))
      vi.useRealTimers()
    })

    it("counts as a miss: the word comes back soon and the day counts toward the streak", () => {
      const entry = { ...weakWord("heart", "You have my whole heart"), timesWrong: 1, intervalIndex: 2 }
      useReviewStore.setState({ weakWords: [entry] })
      render(<ReviewSession words={[entry]} onFinish={() => {}} />)

      giveUp()

      const [saved] = useReviewStore.getState().weakWords
      expect(saved.timesWrong).toBe(2)
      expect(saved.intervalIndex).toBe(0)
      expect(useStatsStore.getState().progress.activityDays).toHaveLength(1)
    })

    it("keeps what was typed right and gives up on the blanks left empty", () => {
      const words = [
        weakWord("ocean", "ocean forest wide open", { start: 13, end: 16 }),
        weakWord("forest", "ocean forest wide open", { start: 13, end: 16 }),
      ]
      useReviewStore.setState({ weakWords: words })
      const onFinish = vi.fn()
      render(<ReviewSession words={words} onFinish={onFinish} />)

      fireEvent.change(screen.getByLabelText("Missing word 1 of 2"), { target: { value: "ocean" } })
      giveUp()

      expect(screen.getByText(/It was/)).toHaveTextContent("forest")
      fireEvent.click(screen.getByRole("button", { name: "Continue" }))
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ totalReviewed: 2, correctCount: 1 }))
    })

    it("is not offered once the answer is on screen", () => {
      render(<ReviewSession words={[weakWord("heart", "You have my whole heart")]} onFinish={() => {}} />)

      giveUp()

      expect(screen.queryByRole("button", { name: "I don't know" })).not.toBeInTheDocument()
    })
  })

  describe("a line with several missed words", () => {
    const words = [
      weakWord("ocean", "ocean forest wide open", { start: 13, end: 16 }),
      weakWord("forest", "ocean forest wide open", { start: 13, end: 16 }),
    ]

    function fill(first: string, second: string) {
      fireEvent.change(screen.getByLabelText("Missing word 1 of 2"), { target: { value: first } })
      fireEvent.change(screen.getByLabelText("Missing word 2 of 2"), { target: { value: second } })
      fireEvent.click(screen.getByRole("button", { name: "Check" }))
    }

    it("is a single card with one blank per word", () => {
      render(<ReviewSession words={words} onFinish={() => {}} />)

      expect(screen.getByText("1 / 1")).toBeInTheDocument()
      expect(screen.getByLabelText("Missing word 1 of 2")).toBeInTheDocument()
      expect(screen.getByLabelText("Missing word 2 of 2")).toBeInTheDocument()
      expect(screen.getByText("wide")).toBeInTheDocument()
    })

    it("does not check anything until every blank is filled in", () => {
      render(<ReviewSession words={words} onFinish={() => {}} />)

      fireEvent.change(screen.getByLabelText("Missing word 1 of 2"), { target: { value: "ocean" } })
      fireEvent.click(screen.getByRole("button", { name: "Check" }))

      expect(screen.queryByText(/Correct!/)).not.toBeInTheDocument()
      expect(useStatsStore.getState().progress.activityDays).toHaveLength(0)
    })

    it("grades each word on its own", () => {
      vi.useFakeTimers()
      const onFinish = vi.fn()
      render(<ReviewSession words={words} onFinish={onFinish} />)

      fill("ocean", "table")

      expect(screen.getByText(/It was/)).toHaveTextContent("forest")
      vi.advanceTimersByTime(1300)
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ totalReviewed: 2, correctCount: 1 }))
      vi.useRealTimers()
    })

    it("moves on by itself when every word is right", () => {
      vi.useFakeTimers()
      const onFinish = vi.fn()
      render(<ReviewSession words={words} onFinish={onFinish} />)

      fill("ocean", "forest")
      expect(screen.getByText("Correct!")).toBeInTheDocument()
      vi.advanceTimersByTime(1300)

      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ totalReviewed: 2, correctCount: 2 }))
      vi.useRealTimers()
    })
  })

  describe("with the video of the moment", () => {
    beforeEach(() => {
      useLibraryStore.setState({ songs: [SONG] })
    })

    it("plays the clip the word was missed in", () => {
      render(
        <ReviewSession
          words={[weakWord("ocean", "ocean forest wide open", { start: 13, end: 16 })]}
          onFinish={() => {}}
        />,
      )

      const player = screen.getByTestId("clip-player")
      expect(player).toHaveAttribute("data-youtube", "yt-1")
      expect(player).toHaveAttribute("data-clip", "13-16")
    })

    it("finds the clip again for a word saved before clips were recorded", () => {
      render(
        <ReviewSession
          words={[weakWord("ocean", "we sing river mountain ocean forest wide open")]}
          onFinish={() => {}}
        />,
      )

      expect(screen.getByTestId("clip-player")).toHaveAttribute("data-clip", "13-16")
      // The card shows just that line, not the whole chunk it was saved in.
      expect(screen.queryByText("river")).not.toBeInTheDocument()
    })

    it("misses the entry it was shown from, without making a second one", () => {
      const old = weakWord("ocean", "we sing river mountain ocean forest wide open")
      useReviewStore.setState({ weakWords: [old] })
      render(<ReviewSession words={[old]} onFinish={() => {}} />)

      answer("table")

      const { weakWords } = useReviewStore.getState()
      expect(weakWords).toHaveLength(1)
      expect(weakWords[0].timesWrong).toBe(2)
    })

    it("credits the entry it was shown from when the answer is right", () => {
      const entry = { ...weakWord("ocean", "ocean forest wide open", { start: 13, end: 16 }), intervalIndex: 1 }
      useReviewStore.setState({ weakWords: [entry] })
      render(<ReviewSession words={[entry]} onFinish={() => {}} />)

      answer("ocean")

      expect(useReviewStore.getState().weakWords[0].intervalIndex).toBe(2)
    })

    it("waits for Continue after a wrong answer and plays the line again with the answer showing", () => {
      vi.useFakeTimers()
      const onFinish = vi.fn()
      render(
        <ReviewSession
          words={[weakWord("ocean", "ocean forest wide open", { start: 13, end: 16 })]}
          onFinish={onFinish}
        />,
      )
      const before = screen.getByTestId("clip-player").getAttribute("data-playkey")

      answer("table") // nothing to explain about this slip, yet the player should hear it again

      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument()
      expect(screen.getByTestId("clip-player").getAttribute("data-playkey")).not.toBe(before)
      vi.advanceTimersByTime(5000)
      expect(onFinish).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole("button", { name: "Continue" }))
      expect(onFinish).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it("still moves on by itself after a right answer", () => {
      vi.useFakeTimers()
      const onFinish = vi.fn()
      render(
        <ReviewSession
          words={[weakWord("ocean", "ocean forest wide open", { start: 13, end: 16 })]}
          onFinish={onFinish}
        />,
      )

      answer("ocean")
      vi.advanceTimersByTime(1300)

      expect(onFinish).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it("shows no video for a word whose line can't be found", () => {
      render(<ReviewSession words={[weakWord("ocean", "a line that was never in the lyrics")]} onFinish={() => {}} />)

      expect(screen.queryByTestId("clip-player")).not.toBeInTheDocument()
    })
  })
})
