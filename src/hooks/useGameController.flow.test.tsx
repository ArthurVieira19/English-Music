// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { Song } from "@/types/Song"
import type { GameMode } from "@/types/GameMode"
import { DEFAULT_SETTINGS } from "@/services/storage/storageService"
import { LINE_END_FADE_SECONDS, LINE_END_PAUSE_LEAD_SECONDS } from "@/modules/game/lineEndGuard"
import type { Level } from "@/modules/game/levels"
import { useGameStore } from "@/stores/gameStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useGameController } from "./useGameController"

const YT_PLAYING = 1
const YT_PAUSED = 2

// A video whose clock the test moves by hand, reporting play/pause the way YouTube does.
const video = vi.hoisted(() => ({
  time: 0,
  volumes: [] as number[],
  pauses: 0,
  onStateChange: null as ((state: number) => void) | null,
}))

vi.mock("@/modules/player/youtubePlayer", () => ({
  YouTubePlayer: class {
    constructor(options: { onStateChange?: (state: number) => void }) {
      video.onStateChange = options.onStateChange ?? null
    }
    play() {
      video.onStateChange?.(1)
    }
    pause() {
      video.pauses++
      video.onStateChange?.(2)
    }
    seek(seconds: number) {
      video.time = seconds
    }
    getCurrentTime() {
      return video.time
    }
    setPlaybackRate() {}
    setVolume(volume: number) {
      video.volumes.push(volume)
    }
    destroy() {}
  },
}))

vi.mock("@/services/leaderboard/songScoreService", () => ({
  songScoreService: { startPlay: vi.fn().mockResolvedValue(null), submit: vi.fn(), loadBoard: vi.fn() },
}))

const LINE_END = 18
const PAUSE_AT = LINE_END - LINE_END_PAUSE_LEAD_SECONDS
const FADE_START = PAUSE_AT - LINE_END_FADE_SECONDS

/** One 8-second line, so it is never merged with anything. */
const SONG: Song = {
  id: "song-flow",
  title: "T",
  artist: "A",
  youtubeId: "yt",
  thumbnail: "",
  difficulty: "beginner",
  lyrics: [{ start: 10, end: LINE_END, text: "we sing river mountain ocean forest" }],
}

/** Same first line plus a second, so answering the first line doesn't end the song. */
const TWO_LINE_SONG: Song = {
  ...SONG,
  id: "song-flow-2",
  lyrics: [...SONG.lyrics, { start: LINE_END, end: LINE_END + 8, text: "we sing river mountain ocean forest" }],
}

const BEGINNER_1: Level = { difficulty: "beginner", stage: 1 }
const ADVANCED_1: Level = { difficulty: "advanced", stage: 1 }

let frames: FrameRequestCallback[] = []

function frame() {
  const run = frames
  frames = []
  act(() => run.forEach((callback) => callback(performance.now())))
}

function mount(level: Level = BEGINNER_1, mode: GameMode = "typing", song: Song = SONG) {
  const hook = renderHook(() => useGameController(song, "player", level, mode))
  video.time = 12
  frame() // the synchronizer picks up the line
  act(() => hook.result.current.play())
  return hook
}

/** Plays through the fade window and on to the stopping point, the way real frames would. */
function fadeThenPause() {
  video.time = FADE_START + LINE_END_FADE_SECONDS / 2
  frame()
  video.time = PAUSE_AT
  frame()
}

const openBlanks = () => {
  const { exercises, answeredTokens } = useGameStore.getState()
  return exercises[0].tokens.filter((t) => t.isHidden && !(`0:${t.index}` in answeredTokens))
}

beforeEach(() => {
  frames = []
  video.time = 0
  video.volumes = []
  video.pauses = 0
  localStorage.clear()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("stopping at the end of a line with open blanks", () => {
  it("leaves the volume alone for most of the line", () => {
    mount()
    video.volumes = []

    video.time = FADE_START - 0.5
    frame()

    expect(video.volumes).toEqual([])
    expect(video.pauses).toBe(0)
  })

  it("eases the volume out over the line's last moment", () => {
    mount()

    video.time = FADE_START + LINE_END_FADE_SECONDS / 2
    frame()

    expect(video.volumes.at(-1)).toBeCloseTo(DEFAULT_SETTINGS.volume / 2)
    expect(video.pauses).toBe(0)
  })

  it("pauses just before the line ends and waits on that line", () => {
    mount()

    video.time = PAUSE_AT
    frame()

    expect(video.pauses).toBe(1)
    expect(useGameStore.getState().pendingRetryLineIndex).toBe(0)
  })

  it("restores the volume and carries on once the blank is answered", () => {
    const { result } = mount()
    fadeThenPause()

    const [blank] = openBlanks()
    act(() => {
      result.current.submitAnswer(0, blank.index, blank.answer as string)
    })

    expect(useGameStore.getState().pendingRetryLineIndex).toBeNull()
    expect(video.volumes.at(-1)).toBe(DEFAULT_SETTINGS.volume)
  })

  it("restores the volume when playback is resumed from YouTube's own controls", () => {
    mount()
    fadeThenPause()
    expect(video.volumes.at(-1)).toBeLessThan(DEFAULT_SETTINGS.volume)

    act(() => video.onStateChange?.(YT_PAUSED))
    act(() => video.onStateChange?.(YT_PLAYING))

    expect(video.volumes.at(-1)).toBe(DEFAULT_SETTINGS.volume)
  })

  it("does not stop on a line that has nothing left to answer", () => {
    const { result } = mount(ADVANCED_1, "typing", TWO_LINE_SONG)
    const blanks = openBlanks()
    for (const blank of blanks) {
      act(() => {
        result.current.submitAnswer(0, blank.index, blank.answer as string)
      })
    }
    const pausesBefore = video.pauses

    video.time = PAUSE_AT
    frame()

    expect(result.current.isComplete).toBe(false)
    expect(video.pauses).toBe(pausesBefore)
    expect(useGameStore.getState().pendingRetryLineIndex).toBeNull()
  })
})

describe("skipWord", () => {
  it("gives up on just the first open blank of the line", () => {
    const { result } = mount(ADVANCED_1)
    const before = openBlanks()
    expect(before.length).toBeGreaterThan(1)

    act(() => result.current.skipWord())

    const { answeredTokens } = useGameStore.getState()
    expect(answeredTokens[`0:${before[0].index}`]).toBe(false)
    expect(openBlanks()).toHaveLength(before.length - 1)
  })

  it("can skip a named blank", () => {
    const { result } = mount(ADVANCED_1)
    const last = openBlanks().at(-1)!

    act(() => result.current.skipWord(last.index))

    expect(useGameStore.getState().answeredTokens[`0:${last.index}`]).toBe(false)
  })

  it("resumes the song once the line it was waiting on is cleared", () => {
    const { result } = mount(ADVANCED_1)
    video.time = PAUSE_AT
    frame()
    expect(useGameStore.getState().pendingRetryLineIndex).toBe(0)

    for (let i = openBlanks().length; i > 0; i--) act(() => result.current.skipWord())

    expect(useGameStore.getState().pendingRetryLineIndex).toBeNull()
    expect(result.current.isComplete).toBe(true)
  })
})

describe("level progression", () => {
  it("moves the player up a step after a strong run at their level", () => {
    useSettingsStore.getState().updateSettings({ currentLevel: "beginner-1" })
    const { result } = mount(BEGINNER_1)

    for (const blank of openBlanks()) {
      act(() => {
        result.current.submitAnswer(0, blank.index, blank.answer as string)
      })
    }

    expect(result.current.lastResult?.level).toBe("beginner-1")
    expect(result.current.lastResult?.levelUp).toBe("beginner-2")
    expect(useSettingsStore.getState().settings.currentLevel).toBe("beginner-2")
  })

  it("leaves the level alone after a weak run", () => {
    useSettingsStore.getState().updateSettings({ currentLevel: "beginner-1" })
    const { result } = mount(BEGINNER_1)

    for (let i = openBlanks().length; i > 0; i--) act(() => result.current.skipWord())

    expect(result.current.lastResult?.levelUp).toBeUndefined()
    expect(useSettingsStore.getState().settings.currentLevel).toBe("beginner-1")
  })
})

describe("word-bank mode", () => {
  it("builds blanks without per-blank choices", () => {
    mount(BEGINNER_1, "wordBank")
    const [line] = useGameStore.getState().exercises

    expect(line.mode).toBe("wordBank")
    expect(line.tokens.some((t) => t.isHidden)).toBe(true)
    for (const token of line.tokens) expect(token.choices).toBeUndefined()
  })
})
