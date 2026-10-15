// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { ReviewClipPlayer } from "./review-clip-player"
import { CLIP_LEAD_IN_SECONDS } from "@/modules/review/reviewClip"
import { LINE_END_PAUSE_LEAD_SECONDS } from "@/modules/game/lineEndGuard"
import { DEFAULT_SETTINGS } from "@/services/storage/storageService"
import { useSettingsStore } from "@/stores/settingsStore"

const YT_PLAYING = 1
const YT_PAUSED = 2

// A video whose clock the test moves by hand, reporting play/pause the way YouTube does.
const video = vi.hoisted(() => ({
  time: 0,
  calls: [] as string[],
  volumes: [] as number[],
  seeks: [] as number[],
  rates: [] as number[],
  options: null as {
    videoId: string
    controls?: boolean
    playsInline?: boolean
    onReady?: () => void
    onStateChange?: (state: number) => void
    onError?: (code: number) => void
  } | null,
  destroyed: 0,
}))

vi.mock("@/modules/player/youtubePlayer", () => ({
  YouTubePlayer: class {
    constructor(options: NonNullable<typeof video.options>) {
      video.options = options
    }
    play() {
      video.calls.push("play")
      video.options?.onStateChange?.(YT_PLAYING)
    }
    pause() {
      video.calls.push("pause")
      video.options?.onStateChange?.(YT_PAUSED)
    }
    seek(seconds: number) {
      video.seeks.push(seconds)
      video.time = seconds
    }
    getCurrentTime() {
      return video.time
    }
    setPlaybackRate(rate: number) {
      video.rates.push(rate)
    }
    setVolume(volume: number) {
      video.volumes.push(volume)
    }
    destroy() {
      video.destroyed++
    }
  },
}))

const CLIP = { start: 13, end: 16 }
const FROM = CLIP.start - CLIP_LEAD_IN_SECONDS
const PAUSE_AT = CLIP.end - LINE_END_PAUSE_LEAD_SECONDS

let frames: FrameRequestCallback[] = []
let now = 0

function frame() {
  const run = frames
  frames = []
  act(() => run.forEach((callback) => callback(now)))
}

/** Moves both the video's clock and the page's clock, the way real playback would. */
function advance(videoTime: number) {
  now += 1000
  video.time = videoTime
  frame()
}

function mount(overrides: Partial<Parameters<typeof ReviewClipPlayer>[0]> = {}) {
  return render(
    <ReviewClipPlayer
      youtubeId="yt-1"
      songId="s1"
      clip={CLIP}
      playKey="0:0"
      rate={1}
      onRateChange={() => {}}
      {...overrides}
    />,
  )
}

function ready() {
  act(() => video.options?.onReady?.())
}

beforeEach(() => {
  frames = []
  now = 0
  video.time = 0
  video.calls = []
  video.volumes = []
  video.seeks = []
  video.rates = []
  video.options = null
  video.destroyed = 0
  localStorage.clear()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  vi.spyOn(performance, "now").mockImplementation(() => now)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ReviewClipPlayer", () => {
  it("asks for a player with no YouTube controls, played in place", () => {
    mount()

    expect(video.options).toMatchObject({ videoId: "yt-1", controls: false, playsInline: true })
  })

  it("waits for the video to be ready, then plays the clip from just before the line", () => {
    mount()
    expect(video.calls).toEqual([])
    expect(screen.getByRole("button", { name: /Play the line/ })).toBeDisabled()

    ready()

    expect(video.seeks).toEqual([FROM])
    expect(video.calls).toEqual(["play"])
    expect(screen.getByRole("button", { name: /Replay the line/ })).toBeEnabled()
  })

  it("applies the sync fix saved for the song, so it is the same moment the game plays", () => {
    useSettingsStore.getState().setSongOffset("s1", 2)
    mount()
    ready()

    expect(video.seeks).toEqual([FROM + 2])
  })

  it("eases the volume out and stops at the end of the line", () => {
    mount()
    ready()
    video.volumes = []

    advance(PAUSE_AT - 0.15) // inside the fade
    expect(video.volumes.at(-1)).toBeGreaterThan(0)
    expect(video.volumes.at(-1)).toBeLessThan(DEFAULT_SETTINGS.volume)
    expect(video.calls).not.toContain("pause")

    advance(PAUSE_AT)
    expect(video.calls).toContain("pause")
    expect(video.volumes.at(-1)).toBe(0)
  })

  it("leaves a clip that is still playing alone", () => {
    mount()
    ready()
    video.volumes = []

    advance(CLIP.start + 1)

    expect(video.volumes).toEqual([])
    expect(video.calls).toEqual(["play"])
  })

  it("does not mistake the old position for the end right after starting", () => {
    mount()
    ready()
    now = 100 // a moment after play(), well inside the settle window
    video.time = 99 // the player still reports a stale time past the end

    frame()

    expect(video.calls).toEqual(["play"])
  })

  it("replays from the start of the line at full volume", () => {
    mount()
    ready()
    advance(PAUSE_AT)
    expect(video.calls.at(-1)).toBe("pause")

    fireEvent.click(screen.getByRole("button", { name: /Replay the line/ }))

    expect(video.seeks.at(-1)).toBe(FROM)
    expect(video.calls.at(-1)).toBe("play")
    expect(video.volumes.at(-1)).toBe(DEFAULT_SETTINGS.volume)
  })

  it("plays again when asked to from outside", () => {
    const view = mount()
    ready()
    expect(video.calls).toEqual(["play"])

    view.rerender(
      <ReviewClipPlayer youtubeId="yt-1" songId="s1" clip={CLIP} playKey="0:1" rate={1} onRateChange={() => {}} />,
    )

    expect(video.calls).toEqual(["play", "play"])
  })

  it("plays the new clip when the card changes but the video stays", () => {
    const view = mount()
    ready()

    view.rerender(
      <ReviewClipPlayer
        youtubeId="yt-1"
        songId="s1"
        clip={{ start: 40, end: 44 }}
        playKey="1:0"
        rate={1}
        onRateChange={() => {}}
      />,
    )

    expect(video.seeks.at(-1)).toBe(40 - CLIP_LEAD_IN_SECONDS)
  })

  it("applies the chosen speed once the video is ready", () => {
    mount({ rate: 0.5 })
    expect(video.rates).toEqual([])

    ready()

    expect(video.rates).toEqual([0.5])
  })

  it("says so when the video can't be played, instead of showing an empty frame", () => {
    mount()

    act(() => video.options?.onError?.(101))

    expect(screen.getByText(/can.t be played here/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Play the line/ })).toBeDisabled()
  })

  it("lets go of the video when it goes away", () => {
    const view = mount()
    ready()

    view.unmount()

    expect(video.destroyed).toBe(1)
  })
})
