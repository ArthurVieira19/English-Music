// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { Song } from "@/types/Song"
import { DEFAULT_SETTINGS } from "@/services/storage/storageService"
import { useGameStore } from "@/stores/gameStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useGameController } from "./useGameController"

// A video whose clock the test moves by hand.
const video = vi.hoisted(() => ({ time: 0, seeks: [] as number[] }))

vi.mock("@/modules/player/youtubePlayer", () => ({
  YouTubePlayer: class {
    play() {}
    pause() {}
    seek(seconds: number) {
      video.seeks.push(seconds)
      video.time = seconds
    }
    getCurrentTime() {
      return video.time
    }
    setPlaybackRate() {}
    setVolume() {}
    destroy() {}
  },
}))

vi.mock("@/services/leaderboard/songScoreService", () => ({
  songScoreService: { startPlay: vi.fn().mockResolvedValue(null), submit: vi.fn(), loadBoard: vi.fn() },
}))

const LINE = "we sing river mountain ocean forest"

/** Three 8-second lines (long enough that they are not merged into one chunk). */
function threeLineSong(): Song {
  return {
    id: "song-offset",
    title: "T",
    artist: "A",
    youtubeId: "yt",
    thumbnail: "",
    difficulty: "beginner",
    lyrics: [
      { start: 0, end: 8, text: LINE },
      { start: 8, end: 16, text: LINE },
      { start: 16, end: 24, text: LINE },
    ],
  }
}

function singleLineSong(): Song {
  return { ...threeLineSong(), id: "song-single", lyrics: [{ start: 10, end: 18, text: LINE }] }
}

let frames: FrameRequestCallback[] = []

/** Runs one animation frame: everything queued so far, once. */
function frame() {
  const run = frames
  frames = []
  act(() => run.forEach((callback) => callback(performance.now())))
}

function mount(song: Song) {
  return renderHook(() => useGameController(song, "player", { difficulty: "beginner", stage: 1 }, "typing"))
}

beforeEach(() => {
  frames = []
  video.time = 0
  video.seeks = []
  localStorage.clear()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useGameController lyric sync offset", () => {
  it("starts with the offset saved for the song", () => {
    useSettingsStore.getState().setSongOffset("song-offset", 4)
    video.time = 7 // lyric time 3 -> first line; with no offset it would be the second

    const { result } = mount(threeLineSong())
    frame()

    expect(result.current.syncOffset).toBe(4)
    expect(useGameStore.getState().activeExerciseIndex).toBe(0)
  })

  it("moves the active line as soon as the offset changes, mid-song", () => {
    video.time = 12 // second line (8-16)
    const { result } = mount(threeLineSong())
    act(() => result.current.skipLine()) // line 0's blanks resolved so reaching line 1 isn't a miss
    frame()
    expect(useGameStore.getState().activeExerciseIndex).toBe(1)

    act(() => result.current.setSyncOffset(6)) // lyric time 6 -> first line
    frame()

    expect(useGameStore.getState().activeExerciseIndex).toBe(0)
  })

  it("does not read the correction as a skipped line", () => {
    video.time = 12
    const { result } = mount(threeLineSong())
    act(() => result.current.skipLine())
    frame()
    // Line 1 now has open blanks. Pulling the clock back to line 0 must not
    // pause the song to ask the player to retry line 1.
    act(() => result.current.setSyncOffset(6))
    frame()

    expect(useGameStore.getState().pendingRetryLineIndex).toBeNull()
  })

  it("still pauses for a retry when the song genuinely moves past an unanswered line", () => {
    video.time = 12
    const { result } = mount(threeLineSong())
    act(() => result.current.skipLine())
    frame()
    expect(useGameStore.getState().activeExerciseIndex).toBe(1)

    video.time = 20 // naturally on to the third line, leaving line 1 unanswered
    frame()

    expect(useGameStore.getState().pendingRetryLineIndex).toBe(1)
  })

  it("remembers the correction for the song on the player's account", () => {
    const { result } = mount(threeLineSong())

    act(() => result.current.setSyncOffset(2.5))

    expect(result.current.syncOffset).toBe(2.5)
    expect(useSettingsStore.getState().getSongOffset("song-offset")).toBe(2.5)
  })

  it("clears the saved correction when reset to zero", () => {
    useSettingsStore.getState().setSongOffset("song-offset", 3)
    const { result } = mount(threeLineSong())

    act(() => result.current.setSyncOffset(0))

    expect(result.current.syncOffset).toBe(0)
    expect(useSettingsStore.getState().settings.songOffsets).toEqual({})
  })

  it("seeks to a line's start in lyric time, landing on the sung moment", () => {
    useSettingsStore.getState().setSongOffset("song-offset", 4)
    const { result } = mount(threeLineSong())
    frame()

    act(() => result.current.seekToLine(1)) // line 1 is stamped at 8s

    expect(video.seeks.at(-1)).toBe(12) // 8 + 4 on the video's own clock
  })

  it("calibrates from a tap on the highlighted line", () => {
    video.time = 14.25 // the singer started the 10s line at 14s, and the tap lands a quarter second late
    const { result } = mount(singleLineSong())
    frame()
    expect(useGameStore.getState().activeExerciseIndex).toBe(0)

    let accepted = false
    act(() => {
      accepted = result.current.syncToCurrentLine()
    })

    expect(accepted).toBe(true)
    expect(result.current.syncOffset).toBe(4)
    expect(useSettingsStore.getState().getSongOffset("song-single")).toBe(4)
  })

  it("refuses to calibrate while the song is paused waiting for a retry", () => {
    video.time = 12
    const { result } = mount(threeLineSong())
    frame() // jumps past unanswered line 0 -> pending retry
    expect(useGameStore.getState().pendingRetryLineIndex).toBe(0)

    let accepted = true
    act(() => {
      accepted = result.current.syncToCurrentLine()
    })

    expect(accepted).toBe(false)
    expect(result.current.syncOffset).toBe(0)
  })

  it("ignores a no-op change", () => {
    const { result } = mount(threeLineSong())

    act(() => result.current.setSyncOffset(0))

    expect(useSettingsStore.getState().settings.songOffsets).toBeUndefined()
  })
})
