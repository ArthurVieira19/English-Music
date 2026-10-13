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
vi.mock("@/services/lyrics/lrclibClient", () => ({
  searchSyncedLyrics: (title: string, artist: string) => searchSyncedLyrics(title, artist),
}))

const VIDEO_ID = "YQHsXMglC9A"
const LINK = `https://www.youtube.com/watch?v=${VIDEO_ID}`

function lyrics(id: number, trackName: string, artistName: string): LrclibResult {
  return {
    id,
    trackName,
    artistName,
    albumName: "25",
    duration: 295,
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

  it("finds the lyrics and picks a sure match on its own", async () => {
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

    expect(screen.getByRole("link", { name: /Find “Adele – Hello” on YouTube/ })).toHaveAttribute(
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
