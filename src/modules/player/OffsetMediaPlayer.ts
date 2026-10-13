import type { MediaPlayer } from "./MediaPlayer"

/**
 * Wraps a player so the rest of the game lives entirely in *lyric time*.
 * Lyric timestamps are measured against one recording while the video being
 * played may differ from it by a few seconds, so reading the clock and seeking
 * both translate through `offset` here — the synchronizer, replay, retry and
 * rewind never need to know the two clocks differ, and the offset can be
 * changed mid-song without rebuilding anything.
 *
 * lyric time = video time - offset
 */
export class OffsetMediaPlayer implements MediaPlayer {
  private offset: number

  constructor(
    private readonly inner: MediaPlayer,
    offset = 0,
  ) {
    this.offset = Number.isFinite(offset) ? offset : 0
  }

  getOffset(): number {
    return this.offset
  }

  setOffset(offset: number): void {
    this.offset = Number.isFinite(offset) ? offset : 0
  }

  /** The video's own clock, for the one caller (tap-to-sync) that needs to bypass the offset. */
  getRawTime(): number {
    return this.inner.getCurrentTime()
  }

  getCurrentTime(): number {
    return this.inner.getCurrentTime() - this.offset
  }

  seek(seconds: number): void {
    // A video can't seek before its start, whatever the offset says.
    this.inner.seek(Math.max(0, seconds + this.offset))
  }

  play(): void {
    this.inner.play()
  }

  pause(): void {
    this.inner.pause()
  }

  setPlaybackRate(rate: number): void {
    this.inner.setPlaybackRate(rate)
  }

  setVolume(volume: number): void {
    this.inner.setVolume(volume)
  }

  destroy(): void {
    this.inner.destroy()
  }
}
