import { describe, expect, it } from "vitest"
import { normalizeForMatch, rankLyricsMatches } from "./rankLyricsMatches"

const r = (trackName: string, artistName: string) => ({ trackName, artistName })

describe("normalizeForMatch", () => {
  it("ignores case, accents, punctuation and featured artists", () => {
    expect(normalizeForMatch("Beyoncé")).toBe("beyonce")
    expect(normalizeForMatch("Get Lucky (feat. Pharrell Williams)")).toBe("get lucky")
    expect(normalizeForMatch("Simon & Garfunkel")).toBe("simon and garfunkel")
    expect(normalizeForMatch("Don't Stop Me Now!")).toBe("don t stop me now")
  })
})

describe("rankLyricsMatches", () => {
  it("puts the exact song first even when the search returned it later", () => {
    const ranked = rankLyricsMatches(
      [r("Hello (Live at the Royal Albert Hall)", "Adele"), r("Hello", "Lionel Richie"), r("Hello", "Adele")],
      { title: "Hello", artist: "Adele" },
    )

    expect(ranked[0]).toEqual({ result: r("Hello", "Adele"), confidence: "exact" })
  })

  it("ranks a live or remastered version as close, not exact", () => {
    const [match] = rankLyricsMatches([r("Hello - Live", "Adele")], { title: "Hello", artist: "Adele" })

    expect(match.confidence).toBe("close")
  })

  it("does not call a same-named song by another artist exact", () => {
    const [match] = rankLyricsMatches([r("Hello", "Lionel Richie")], { title: "Hello", artist: "Adele" })

    expect(match.confidence).toBe("weak")
  })

  it("forgives an artist written differently", () => {
    const [match] = rankLyricsMatches([r("Halo", "Beyoncé")], { title: "Halo", artist: "Beyonce" })

    expect(match.confidence).toBe("exact")
  })

  it("accepts a featured artist on either side", () => {
    const [match] = rankLyricsMatches([r("Get Lucky (feat. Pharrell Williams)", "Daft Punk")], {
      title: "Get Lucky",
      artist: "Daft Punk",
    })

    expect(match.confidence).toBe("exact")
  })

  it("matches on the title alone when the artist is unknown", () => {
    const [match] = rankLyricsMatches([r("Shape of You", "Ed Sheeran")], { title: "Shape of You", artist: "" })

    expect(match.confidence).toBe("exact")
  })

  it("keeps the search's own order between equally good results", () => {
    const ranked = rankLyricsMatches([r("Yellow", "Coldplay"), r("Yellow", "Coldplay")].map((x, i) => ({ ...x, i })), {
      title: "Yellow",
      artist: "Coldplay",
    })

    expect(ranked.map((m) => m.result.i)).toEqual([0, 1])
  })

  it("returns nothing for no results", () => {
    expect(rankLyricsMatches([], { title: "x", artist: "y" })).toEqual([])
  })
})
