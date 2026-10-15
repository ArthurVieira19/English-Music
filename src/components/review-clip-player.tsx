"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Play, Repeat } from "lucide-react"
import type { WeakWordClip } from "@/types/WeakWord"
import { YouTubePlayer } from "@/modules/player/youtubePlayer"
import { OffsetMediaPlayer } from "@/modules/player/OffsetMediaPlayer"
import { lineEndState } from "@/modules/game/lineEndGuard"
import { clipWindow } from "@/modules/review/reviewClip"
import { useSettingsStore } from "@/stores/settingsStore"
import { PlaybackRateControl } from "@/components/playback-rate-control"
import { cn } from "@/lib/utils"

const YOUTUBE_STATE_PLAYING = 1
/** Volume changes smaller than this aren't sent to the player, which would otherwise get one every frame of a fade. */
const VOLUME_STEP = 0.05
/** Right after a seek the player can still report the old position; don't mistake that for the clip being over. */
const PLAY_SETTLE_MS = 500

function setFade(player: OffsetMediaPlayer, fade: { current: number }, factor: number) {
  fade.current = factor
  player.setVolume(useSettingsStore.getState().settings.volume * factor)
}

/**
 * Plays one stretch of a song's video and stops at the end of it, so a review
 * card can replay exactly the line the player missed. The page that renders it
 * gives it a `key` per video: a different song means a new player.
 *
 * `playKey` is the way to ask for a (re)play from outside: the clip plays when
 * the video is ready, and again every time the key changes.
 */
export function ReviewClipPlayer({
  youtubeId,
  songId,
  clip,
  playKey,
  rate,
  onRateChange,
}: {
  youtubeId: string
  songId: string
  clip: WeakWordClip
  playKey: string | number
  rate: number
  onRateChange: (rate: number) => void
}) {
  const elementId = `review-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`

  /** Everything goes through this wrapper, so the clip is in lyric time like the game: the song's saved sync fix applies. */
  const playerRef = useRef<OffsetMediaPlayer | null>(null)
  const spanRef = useRef<{ from: number; to: number } | null>(null)
  const playingRef = useRef(false)
  const startedAtRef = useRef(0)
  const fadeRef = useRef(1)
  // The player outlives renders, so its callbacks read the clip from here.
  const live = useRef({ clip })
  useEffect(() => {
    live.current = { clip }
  })

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const youtube = new YouTubePlayer({
      elementId,
      videoId: youtubeId,
      controls: false,
      playsInline: true,
      onReady: () => {
        youtube.setVolume(useSettingsStore.getState().settings.volume)
        setIsReady(true)
      },
      onStateChange: (state) => {
        playingRef.current = state === YOUTUBE_STATE_PLAYING
        setIsPlaying(playingRef.current)
      },
      onError: () => setFailed(true),
    })
    const player = new OffsetMediaPlayer(youtube, useSettingsStore.getState().getSongOffset(songId))
    playerRef.current = player

    // Eases the volume out over the last moment of the clip and stops just
    // before it ends, so the next line never starts to bleed in.
    let frame = 0
    const tick = () => {
      const span = spanRef.current
      if (span && playingRef.current && performance.now() - startedAtRef.current > PLAY_SETTLE_MS) {
        const { volume, pause } = lineEndState(player.getCurrentTime(), span.to)
        if (pause) {
          player.pause()
          spanRef.current = null
          setFade(player, fadeRef, 0)
        } else if (Math.abs(volume - fadeRef.current) >= VOLUME_STEP || (volume === 1 && fadeRef.current !== 1)) {
          setFade(player, fadeRef, volume)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      player.destroy()
      playerRef.current = null
      spanRef.current = null
      playingRef.current = false
    }
  }, [elementId, youtubeId, songId])

  const play = useCallback(() => {
    const player = playerRef.current
    if (!player) return

    const span = clipWindow(live.current.clip)
    spanRef.current = span
    startedAtRef.current = performance.now()
    if (fadeRef.current !== 1) setFade(player, fadeRef, 1)
    player.seek(span.from)
    player.play()
    setHasPlayed(true)
  }, [])

  // Plays on its own when the card appears (and whenever asked again), as soon
  // as the video is ready. Browsers that block sound until a tap leave it
  // paused, and the button below is the way in.
  useEffect(() => {
    if (isReady) play()
  }, [isReady, playKey, play])

  useEffect(() => {
    if (isReady) playerRef.current?.setPlaybackRate(rate)
  }, [isReady, rate])

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={cn(
          "overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-shadow duration-500",
          isPlaying && "shadow-[0_0_0_1px_var(--glow-primary)]",
        )}
      >
        {/* Inert on purpose: the only way to move around the video is the buttons below, which keep it inside the clip. */}
        <div className="yt-frame pointer-events-none relative aspect-video w-full overflow-hidden bg-black">
          <div id={elementId} className="absolute inset-0" />
          {!isReady && !failed && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-card" aria-hidden />
          )}
          {failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-card p-4 text-center text-sm text-muted-foreground">
              This video can&apos;t be played here, so the line is shown as text only.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={play}
          disabled={!isReady || failed}
          className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-accent/60 px-4 text-sm font-medium transition-[transform,background-color] duration-150 disabled:opacity-40 enabled:hover:bg-accent enabled:active:scale-95"
        >
          {hasPlayed ? <Repeat aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" fill="currentColor" />}
          {hasPlayed ? "Replay the line" : "Play the line"}
        </button>
        <PlaybackRateControl rate={rate} onChange={onRateChange} disabled={!isReady || failed} />
      </div>
    </div>
  )
}
