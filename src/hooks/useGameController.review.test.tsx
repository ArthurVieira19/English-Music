// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { Song } from "@/types/Song"
import type { Level } from "@/modules/game/levels"
import { DEFAULT_SETTINGS } from "@/services/storage/storageService"
import { useGameStore } from "@/stores/gameStore"
import { useReviewStore } from "@/stores/reviewStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useGameController } from "./useGameController"

// The review pool only needs the game to run; the video itself is irrelevant here.
vi.mock("@/modules/player/youtubePlayer", () => ({
  YouTubePlayer: class {
    play() {}
    pause() {}
    seek() {}
    getCurrentTime() {
      return 12
    }
    setPlaybackRate() {}
    setVolume() {}
    destroy() {}
  },
}))

vi.mock("@/services/leaderboard/songScoreService", () => ({
  songScoreService: { startPlay: vi.fn().mockResolvedValue(null), submit: vi.fn(), loadBoard: vi.fn() },
}))

/** Two short lines that the game plays as one chunk. */
const SONG: Song = {
  id: "song-review",
  title: "River Song",
  artist: "A",
  youtubeId: "yt",
  thumbnail: "",
  difficulty: "beginner",
  lyrics: [
    { start: 10, end: 13, text: "we sing river mountain" },
    { start: 13, end: 16, text: "ocean forest wide open" },
  ],
}

const EXPERT: Level = { difficulty: "expert", stage: 1 }

let frames: FrameRequestCallback[] = []

function mount() {
  const hook = renderHook(() => useGameController(SONG, "player", EXPERT, "typing"))
  const run = frames
  frames = []
  act(() => run.forEach((callback) => callback(performance.now())))
  return hook
}

function hiddenToken(answer: string) {
  const token = useGameStore.getState().exercises[0].tokens.find((t) => t.isHidden && t.answer === answer)
  if (!token) throw new Error(`"${answer}" is not hidden`)
  return token
}

beforeEach(() => {
  frames = []
  localStorage.clear()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useReviewStore.setState({ weakWords: [] })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("recording a missed word for Review", () => {
  it("plays the two lines as one chunk", () => {
    mount()
    expect(useGameStore.getState().exercises).toHaveLength(1)
  })

  it("saves the exact lyric line the word was sung in, not the whole chunk", () => {
    const { result } = mount()
    act(() => result.current.skipWord(hiddenToken("ocean").index))

    const [weak] = useReviewStore.getState().weakWords
    expect(weak.word).toBe("ocean")
    expect(weak.contextText).toBe("ocean forest wide open")
    expect(weak.clip).toEqual({ start: 13, end: 16 })
  })

  it("saves the first line for a word from the first line", () => {
    const { result } = mount()
    act(() => result.current.skipWord(hiddenToken("river").index))

    const [weak] = useReviewStore.getState().weakWords
    expect(weak.contextText).toBe("we sing river mountain")
    expect(weak.clip).toEqual({ start: 10, end: 13 })
  })

  it("misses the same word in the same line twice as one entry", () => {
    const first = mount()
    act(() => first.result.current.skipWord(hiddenToken("ocean").index))
    first.unmount()

    // Played again later.
    const second = mount()
    act(() => second.result.current.skipWord(hiddenToken("ocean").index))

    expect(useReviewStore.getState().weakWords).toHaveLength(1)
    expect(useReviewStore.getState().weakWords[0].timesWrong).toBe(2)
  })

  describe("a right answer for a word already being tracked", () => {
    function entry(songId: string, contextText: string) {
      return {
        word: "ocean",
        songId,
        songTitle: "T",
        artist: "A",
        contextText,
        timesWrong: 1,
        timesCorrect: 0,
        intervalIndex: 0,
        lastSeenAt: 0,
        nextReviewAt: 0, // due, so a right answer moves it up the ladder
      }
    }

    it("moves up only the entry made in that line of that song", () => {
      useReviewStore.setState({
        weakWords: [
          entry("song-review", "ocean forest wide open"),
          entry("another-song", "ocean forest wide open"),
          entry("song-review", "the ocean is deep"),
        ],
      })
      const { result } = mount()

      act(() => {
        result.current.submitAnswer(0, hiddenToken("ocean").index, "ocean")
      })

      expect(useReviewStore.getState().weakWords.map((w) => w.intervalIndex)).toEqual([1, 0, 0])
    })
  })
})
