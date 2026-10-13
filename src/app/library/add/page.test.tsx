// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { LrclibResult } from "@/services/lyrics/lrclibClient"
import type { YoutubeVideoLookup } from "@/services/youtube/youtubeOEmbed"
import { useAuthStore } from "@/stores/authStore"
import { useLibraryStore } from "@/stores/libraryStore"
import AddSongPage from "./page"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const lookupYoutubeVideo = vi.fn<(id: string) => Promise<YoutubeVideoLookup>>()
vi.mock("@/services/youtube/youtubeOEmbed", () => ({
  lookupYoutubeVideo: (id: string) => lookupYoutubeVideo(id),
}))

const searchSyncedLyrics = vi.fn<(title: string, artist: string) => Promise<LrclibResult[]>>()
const getSyncedLyricsForLength = vi.fn<(title: string, artist: string, duration: number) => Promise<LrclibResult | null>>()
vi.mock("@/services/lyrics/lrclibClient", () => ({
  searchSyncedLyrics: (title: string, artist: string) => searchSyncedLyrics(title, artist),
  getSyncedLyricsForLength: (title: string, artist: string, duration: number) =>
    getSyncedLyricsForLength(title, artist, duration),
}))

// The sync check's embedded player: reports a video length the test chooses.
const video = vi.hoisted(() => ({ duration: 295 }))
vi.mock("@/modules/player/youtubePlayer", () => ({
  YouTubePlayer: class {
    constructor(options: { onReady?: () => void }) {
      setTimeout(() => options.onReady?.(), 0)
    }
    getDuration() {
      return video.duration
    }
    getCurrentTime() {
      return 0
    }
    play() {}
    pause() {}
    seek() {}
    setVolume() {}
    setPlaybackRate() {}
    destroy() {}
  },
}))

const VIDEO_ID = "YQHsXMglC9A"
const LINK = `https://www.youtube.com/watch?v=${VIDEO_ID}`

function lyrics(id: number, trackName: string, artistName: string, duration = 295): LrclibResult {
  return {
    id,
    trackName,
    artistName,
    albumName: "25",
    duration,
    instrumental: false,
    plainLyrics: "Hello",
    syncedLyrics: `[00:01.00]${trackName} by ${artistName}`,
  }
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement

function pasteLink(link = LINK) {
  fireEvent.change(field("YouTube link or video ID"), { target: { value: link } })
}

beforeEach(() => {
  lookupYoutubeVideo.mockReset()
  searchSyncedLyrics.mockReset()
  getSyncedLyricsForLength.mockReset()
  getSyncedLyricsForLength.mockResolvedValue(null)
  video.duration = 295
  push.mockReset()
  useAuthStore.setState({ isAdmin: true })
  useLibraryStore.setState({ songs: [] })
  lookupYoutubeVideo.mockResolvedValue({
    ok: true,
    info: { title: "Adele - Hello (Official Music Video)", channel: "AdeleVEVO" },
  })
})

describe("AddSongPage from a YouTube link", () => {
  it("fills in the title and artist from the video", async () => {
    searchSyncedLyrics.mockResolvedValue([])
    render(<AddSongPage />)

    pasteLink()

    await waitFor(() => expect(field("Title").value).toBe("Hello"))
    expect(field("Artist").value).toBe("Adele")
    expect(await screen.findByText("Adele - Hello (Official Music Video)")).toBeInTheDocument()
  })

  it("finds the lyrics and picks the right song timed for this video on its own", async () => {
    searchSyncedLyrics.mockResolvedValue([lyrics(1, "Hello", "Lionel Richie"), lyrics(2, "Hello", "Adele")])
    render(<AddSongPage />)

    pasteLink()

    await waitFor(() => expect(field("Lyrics (LRC format)").value).toBe("[00:01.00]Hello by Adele"))
    expect(searchSyncedLyrics).toHaveBeenCalledWith("Hello", "Adele")
    expect(screen.getByRole("button", { name: /Hello — Adele/ })).toHaveAttribute("aria-pressed", "true")
  })

  it("lists unsure matches without picking one, and fills the one the admin picks", async () => {
    searchSyncedLyrics.mockResolvedValue([lyrics(1, "Hello", "Lionel Richie")])
    render(<AddSongPage />)

    pasteLink()

    const option = await screen.findByRole("button", { name: /Hello — Lionel Richie/ })
    expect(field("Lyrics (LRC format)").value).toBe("")

    fireEvent.click(option)
    expect(field("Lyrics (LRC format)").value).toBe("[00:01.00]Hello by Lionel Richie")
  })

  it("never overwrites a title the admin typed", async () => {
    searchSyncedLyrics.mockResolvedValue([])
    render(<AddSongPage />)

    fireEvent.change(field("Title"), { target: { value: "Hello (Live)" } })
    pasteLink()

    await waitFor(() => expect(field("Artist").value).toBe("Adele"))
    expect(field("Title").value).toBe("Hello (Live)")
    expect(searchSyncedLyrics).toHaveBeenCalledWith("Hello (Live)", "Adele")
  })

  it("never replaces lyrics the admin already pasted", async () => {
    searchSyncedLyrics.mockResolvedValue([lyrics(2, "Hello", "Adele")])
    render(<AddSongPage />)

    fireEvent.change(field("Lyrics (LRC format)"), { target: { value: "[00:02.00]mine" } })
    pasteLink()

    await screen.findByRole("button", { name: /Hello — Adele/ })
    expect(field("Lyrics (LRC format)").value).toBe("[00:02.00]mine")
  })

  it("warns about a video that can't play outside YouTube", async () => {
    lookupYoutubeVideo.mockResolvedValue({ ok: false, reason: "restricted" })
    render(<AddSongPage />)

    pasteLink()

    expect(await screen.findByText(/can't be played outside YouTube/)).toBeInTheDocument()
    expect(searchSyncedLyrics).not.toHaveBeenCalled()
  })

  it("flags a video that is already in the library as soon as it is pasted, without filling anything in", async () => {
    useLibraryStore.setState({
      songs: [
        { id: "s", title: "Hello", artist: "Adele", youtubeId: VIDEO_ID, thumbnail: "", difficulty: "beginner", lyrics: [] },
      ],
    })
    render(<AddSongPage />)

    pasteLink()

    expect(screen.getByText("This video is already in the library.")).toBeInTheDocument()
    await waitFor(() => expect(lookupYoutubeVideo).toHaveBeenCalled())
    await screen.findByText("Adele - Hello (Official Music Video)")
    expect(field("Title").value).toBe("")
    expect(searchSyncedLyrics).not.toHaveBeenCalled()
  })

  it("offers a YouTube search once a title or artist is known", () => {
    render(<AddSongPage />)
    expect(screen.queryByRole("link", { name: /on YouTube/ })).not.toBeInTheDocument()

    fireEvent.change(field("Title"), { target: { value: "Hello" } })
    fireEvent.change(field("Artist"), { target: { value: "Adele" } })

    expect(screen.getByRole("link", { name: /Find the official audio of “Adele – Hello” on YouTube/ })).toHaveAttribute(
      "href",
      expect.stringContaining("search_query=Adele%20Hello"),
    )
  })

  it("does nothing until the link is a real YouTube link", async () => {
    render(<AddSongPage />)

    pasteLink("not a link")
    await new Promise((resolve) => setTimeout(resolve, 450))

    expect(lookupYoutubeVideo).not.toHaveBeenCalled()
  })
})

describe("AddSongPage matching the lyrics' timing to the video", () => {
  it("prefers the version as long as the video", async () => {
    video.duration = 367
    searchSyncedLyrics.mockResolvedValue([lyrics(1, "Hello", "Adele", 295), lyrics(2, "Hello", "Adele", 366)])
    render(<AddSongPage />)

    pasteLink()

    await waitFor(() => expect(field("Lyrics (LRC format)").value).toBe("[00:01.00]Hello by Adele"))
    expect(screen.getByRole("button", { name: /same length as the video/ })).toHaveAttribute("aria-pressed", "true")
  })

  it("picks nothing and explains why when no version is as long as the video", async () => {
    video.duration = 367
    searchSyncedLyrics.mockResolvedValue([lyrics(1, "Hello", "Adele", 295)])
    render(<AddSongPage />)

    pasteLink()

    expect(await screen.findByText(/None of these versions is as long as this video \(6:07\)/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /1:12 shorter than the video/ })).toHaveAttribute("aria-pressed", "false")
    expect(field("Lyrics (LRC format)").value).toBe("")
  })

  it("asks lrclib for a version of the video's length when the search had none, and uses it", async () => {
    video.duration = 367
    searchSyncedLyrics.mockResolvedValue([lyrics(1, "Hello", "Adele", 295)])
    getSyncedLyricsForLength.mockResolvedValue({ ...lyrics(9, "Hello", "Adele", 366), syncedLyrics: "[00:12.00]music video cut" })
    render(<AddSongPage />)

    pasteLink()

    await waitFor(() => expect(field("Lyrics (LRC format)").value).toBe("[00:12.00]music video cut"))
    expect(getSyncedLyricsForLength).toHaveBeenCalledWith("Hello", "Adele", 367)
  })

  it("offers the video's extra length as a first guess for the timing", async () => {
    video.duration = 307
    searchSyncedLyrics.mockResolvedValue([lyrics(1, "Hello", "Adele", 295)])
    render(<AddSongPage />)
    pasteLink()

    fireEvent.click(await screen.findByRole("button", { name: /Hello — Adele/ }))

    expect(await screen.findByRole("button", { name: /The video is 12s longer/ })).toBeInTheDocument()
  })

  it("saves the timing correction into the song", async () => {
    const addSong = vi.fn().mockResolvedValue(undefined)
    useLibraryStore.setState({ addSong })
    searchSyncedLyrics.mockResolvedValue([
      { ...lyrics(2, "Hello", "Adele"), syncedLyrics: "[00:01.00]Hello from the other side\n[00:05.00]I must have called" },
    ])
    render(<AddSongPage />)
    pasteLink()
    await waitFor(() => expect(field("Lyrics (LRC format)").value).toContain("other side"))

    fireEvent.click(screen.getByRole("button", { name: "Lyrics 0.5 seconds later" }))
    fireEvent.click(screen.getByRole("button", { name: "Lyrics 0.5 seconds later" }))
    fireEvent.click(screen.getByRole("button", { name: /Add song and play/ }))

    await waitFor(() => expect(addSong).toHaveBeenCalled())
    const saved = addSong.mock.calls[0][0]
    expect(saved.lyrics[0]).toMatchObject({ start: 2, text: "Hello from the other side" })
    expect(saved.lyrics[1].start).toBe(6)
  })
})
