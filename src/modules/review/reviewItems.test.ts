import { describe, expect, it } from "vitest"
import type { Song } from "@/types/Song"
import type { WeakWord } from "@/types/WeakWord"
import { buildReviewItems } from "./reviewItems"

const SONG: Song = {
  id: "s1",
  title: "Song One",
  artist: "Artist",
  youtubeId: "yt-1",
  thumbnail: "",
  difficulty: "beginner",
  lyrics: [
    { start: 10, end: 13, text: "we sing river mountain" },
    { start: 13, end: 16, text: "ocean forest wide open" },
  ],
}

function weak(word: string, overrides: Partial<WeakWord> = {}): WeakWord {
  return {
    word,
    songId: "s1",
    songTitle: "Song One",
    artist: "Artist",
    contextText: "ocean forest wide open",
    clip: { start: 13, end: 16 },
    timesWrong: 1,
    timesCorrect: 0,
    intervalIndex: 0,
    lastSeenAt: 0,
    nextReviewAt: 0,
    ...overrides,
  }
}

describe("buildReviewItems", () => {
  it("gives a word with a saved clip a video of that moment", () => {
    const [item] = buildReviewItems([weak("ocean")], [SONG])

    expect(item.video).toEqual({ youtubeId: "yt-1", clip: { start: 13, end: 16 } })
    expect(item.words.map((w) => w.word)).toEqual(["ocean"])
  })

  it("puts words missed in the same line on one card", () => {
    const items = buildReviewItems([weak("ocean"), weak("forest")], [SONG])

    expect(items).toHaveLength(1)
    expect(items[0].words.map((w) => w.word)).toEqual(["ocean", "forest"])
  })

  it("keeps different lines of the same song on separate cards, in the order given", () => {
    const first = weak("river", { contextText: "we sing river mountain", clip: { start: 10, end: 13 } })
    const items = buildReviewItems([weak("ocean"), first], [SONG])

    expect(items.map((item) => item.words[0].word)).toEqual(["ocean", "river"])
  })

  it("keeps the same line of different songs apart", () => {
    const other = { ...SONG, id: "s2", youtubeId: "yt-2" }
    const items = buildReviewItems([weak("ocean"), weak("forest", { songId: "s2" })], [SONG, other])

    expect(items).toHaveLength(2)
    expect(items[1].video?.youtubeId).toBe("yt-2")
  })

  it("finds the moment again for a word saved before clips were recorded", () => {
    const old = weak("ocean", {
      contextText: "we sing river mountain ocean forest wide open",
      clip: undefined,
    })
    const [item] = buildReviewItems([old], [SONG])

    expect(item.contextText).toBe("ocean forest wide open")
    expect(item.video?.clip).toEqual({ start: 13, end: 16 })
  })

  it("falls back to text when the song is no longer in the library", () => {
    const [item] = buildReviewItems([weak("ocean")], [])

    expect(item.video).toBeNull()
    expect(item.contextText).toBe("ocean forest wide open")
  })

  it("falls back to text for an old word whose line can't be found", () => {
    const old = weak("ocean", { contextText: "a line that was never in the lyrics", clip: undefined })
    const [item] = buildReviewItems([old], [SONG])

    expect(item.video).toBeNull()
  })

  it("ignores a saved clip that makes no sense", () => {
    const broken = weak("ocean", {
      contextText: "we sing river mountain ocean forest wide open",
      clip: { start: 9, end: 2 },
    })
    const [item] = buildReviewItems([broken], [SONG])

    expect(item.video?.clip).toEqual({ start: 13, end: 16 })
  })

  it("gives a word that isn't in its line a card of its own", () => {
    const lost = weak("mountain", { contextText: "ocean forest wide open" })
    const items = buildReviewItems([weak("ocean"), lost], [SONG])

    expect(items).toHaveLength(2)
  })
})
