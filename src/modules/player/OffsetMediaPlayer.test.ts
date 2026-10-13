import { describe, expect, it, vi } from "vitest"
import type { MediaPlayer } from "./MediaPlayer"
import { OffsetMediaPlayer } from "./OffsetMediaPlayer"

function fakePlayer(time = 0) {
  const player: MediaPlayer & { time: number } = {
    time,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn((seconds: number) => {
      player.time = seconds
    }),
    getCurrentTime: () => player.time,
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
    destroy: vi.fn(),
  }
  return player
}

describe("OffsetMediaPlayer", () => {
  it("reports lyric time: the video clock minus the offset", () => {
    expect(new OffsetMediaPlayer(fakePlayer(14), 4).getCurrentTime()).toBe(10)
  })

  it("is transparent with no offset", () => {
    const inner = fakePlayer(7.5)
    const player = new OffsetMediaPlayer(inner)

    expect(player.getCurrentTime()).toBe(7.5)
    player.seek(3)
    expect(inner.seek).toHaveBeenCalledWith(3)
  })

  it("seeks in lyric time, so a line's stamped start lands on the sung moment", () => {
    const inner = fakePlayer()
    const player = new OffsetMediaPlayer(inner, 4)

    player.seek(10)

    expect(inner.seek).toHaveBeenCalledWith(14)
    expect(player.getCurrentTime()).toBe(10)
  })

  it("never seeks before the start of the video", () => {
    const inner = fakePlayer()

    new OffsetMediaPlayer(inner, -5).seek(2)

    expect(inner.seek).toHaveBeenCalledWith(0)
  })

  it("picks up an offset change on the very next read", () => {
    const player = new OffsetMediaPlayer(fakePlayer(20), 0)
    expect(player.getCurrentTime()).toBe(20)

    player.setOffset(3)

    expect(player.getCurrentTime()).toBe(17)
    expect(player.getOffset()).toBe(3)
  })

  it("exposes the video's own clock for tap-to-sync", () => {
    expect(new OffsetMediaPlayer(fakePlayer(20), 6).getRawTime()).toBe(20)
  })

  it("ignores an offset that is not a finite number", () => {
    const player = new OffsetMediaPlayer(fakePlayer(9), Number.NaN)
    expect(player.getCurrentTime()).toBe(9)

    player.setOffset(Infinity)
    expect(player.getCurrentTime()).toBe(9)
  })

  it("passes everything else straight through", () => {
    const inner = fakePlayer()
    const player = new OffsetMediaPlayer(inner, 2)

    player.play()
    player.pause()
    player.setPlaybackRate(0.75)
    player.setVolume(0.4)
    player.destroy()

    expect(inner.play).toHaveBeenCalled()
    expect(inner.pause).toHaveBeenCalled()
    expect(inner.setPlaybackRate).toHaveBeenCalledWith(0.75)
    expect(inner.setVolume).toHaveBeenCalledWith(0.4)
    expect(inner.destroy).toHaveBeenCalled()
  })
})
