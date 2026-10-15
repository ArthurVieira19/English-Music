import type { MediaPlayer } from "./MediaPlayer"

type YouTubePlayerInstance = {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  setPlaybackRate(rate: number): void
  setVolume(volume: number): void
  destroy(): void
}

interface YouTubeIframeApi {
  Player: new (
    elementId: string | HTMLElement,
    options: {
      videoId: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (event: { target: YouTubePlayerInstance }) => void
        onStateChange?: (event: { data: number; target: YouTubePlayerInstance }) => void
        onError?: (event: { data: number }) => void
      }
    },
  ) => YouTubePlayerInstance
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const IFRAME_API_URL = "https://www.youtube.com/iframe_api"

let iframeApiPromise: Promise<YouTubeIframeApi> | null = null

/** Loads the YouTube iframe API script only once, and only when a player is actually created. */
function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube iframe API can only be loaded in the browser"))
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (iframeApiPromise) {
    return iframeApiPromise
  }

  iframeApiPromise = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      resolve(window.YT as YouTubeIframeApi)
    }

    const script = document.createElement("script")
    script.src = IFRAME_API_URL
    script.async = true
    document.head.appendChild(script)
  })

  return iframeApiPromise
}

export interface YouTubePlayerOptions {
  elementId: string
  videoId: string
  onReady?: () => void
  onStateChange?: (state: number) => void
  onError?: (errorCode: number) => void
  /** YouTube's own controls and keyboard shortcuts. On by default; off when the app decides what part of the video plays. */
  controls?: boolean
  /** Play in place on iPhones instead of taking over the screen, which would hide the card being answered. */
  playsInline?: boolean
}

/** MediaPlayer implementation backed by the YouTube iframe API. */
export class YouTubePlayer implements MediaPlayer {
  private player: YouTubePlayerInstance | null = null
  private destroyed = false
  private ready = false
  private readyQueue: Array<() => void> = []

  constructor(options: YouTubePlayerOptions) {
    loadYouTubeIframeApi().then((YT) => {
      if (this.destroyed) return

      this.player = new YT.Player(options.elementId, {
        videoId: options.videoId,
        playerVars: {
          controls: options.controls === false ? 0 : 1,
          ...(options.controls === false ? { disablekb: 1 } : {}),
          ...(options.playsInline ? { playsinline: 1 } : {}),
          modestbranding: 1,
          rel: 0,
          // Our own synced captions replace YouTube's native ones.
          cc_load_policy: 0,
          iv_load_policy: 3,
          // Tells the embed which page it talks to; without it YouTube logs
          // postMessage origin warnings on every load.
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true
            options.onReady?.()
            this.flushReadyQueue()
          },
          onStateChange: (event) => options.onStateChange?.(event.data),
          onError: (event) => options.onError?.(event.data),
        },
      })
    })
  }

  private flushReadyQueue(): void {
    const queue = this.readyQueue
    this.readyQueue = []
    queue.forEach((fn) => fn())
  }

  private withPlayer(action: (player: YouTubePlayerInstance) => void): void {
    if (this.player) {
      action(this.player)
    } else {
      this.readyQueue.push(() => this.player && action(this.player))
    }
  }

  play(): void {
    this.withPlayer((player) => player.playVideo())
  }

  pause(): void {
    this.withPlayer((player) => player.pauseVideo())
  }

  seek(seconds: number): void {
    this.withPlayer((player) => player.seekTo(seconds, true))
  }

  getCurrentTime(): number {
    // The YT.Player object exists as soon as the constructor returns, but it
    // doesn't gain its real methods until the internal iframe finishes
    // loading and fires onReady — calling getCurrentTime() before that (e.g.
    // from a rAF loop that starts polling immediately on mount) throws.
    if (!this.ready || !this.player) return 0
    return this.player.getCurrentTime()
  }

  /**
   * The video's length in seconds, or 0 while YouTube hasn't loaded its
   * details yet (it can take until playback starts). Not part of MediaPlayer:
   * only the add-song page needs it, to match lyrics to the video.
   */
  getDuration(): number {
    if (!this.ready || !this.player) return 0
    return this.player.getDuration() || 0
  }

  setPlaybackRate(rate: number): void {
    this.withPlayer((player) => player.setPlaybackRate(rate))
  }

  /** Accepts the app's 0-1 scale and converts to the YouTube API's 0-100 range. */
  setVolume(volume: number): void {
    const clamped = Math.round(Math.max(0, Math.min(1, volume)) * 100)
    this.withPlayer((player) => player.setVolume(clamped))
  }

  destroy(): void {
    this.destroyed = true
    this.ready = false
    this.player?.destroy()
    this.player = null
    this.readyQueue = []
  }
}
