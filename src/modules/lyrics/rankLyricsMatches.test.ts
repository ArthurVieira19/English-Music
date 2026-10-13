import { describe, expect, it } from "vitest"
import { DURATION_TOLERANCE_SECONDS, autoPick, normalizeForMatch, rankLyricsMatches } from "./rankLyricsMatches"

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

    expect(ranked[0]).toMatchObject({ result: r("Hello", "Adele"), confidence: "exact" })
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

const timed = (trackName: string, artistName: string, duration: number) => ({ trackName, artistName, duration })

describe("rankLyricsMatches against the video's length", () => {
  const VIDEO = 273

  it("prefers the version timed for a recording as long as the video", () => {
    const ranked = rankLyricsMatches(
      [timed("Hello", "Adele", 295), timed("Hello", "Adele", 272), timed("Hello", "Adele", 330)],
      { title: "Hello", artist: "Adele", videoDuration: VIDEO },
    )

    expect(ranked[0].result.duration).toBe(272)
    expect(ranked[0].timingMatches).toBe(true)
    expect(ranked[0].durationDelta).toBe(-1)
  })

  it("never lets a closer length beat the right song", () => {
    const ranked = rankLyricsMatches([timed("Hello", "Lionel Richie", VIDEO), timed("Hello", "Adele", 295)], {
      title: "Hello",
      artist: "Adele",
      videoDuration: VIDEO,
    })

    expect(ranked[0].result.artistName).toBe("Adele")
    expect(ranked[0].timingMatches).toBe(false)
  })

  it("reports how much longer or shorter the recording is", () => {
    const [match] = rankLyricsMatches([timed("Hello", "Adele", 250)], { title: "Hello", artist: "Adele", videoDuration: VIDEO })

    expect(match.durationDelta).toBe(-23)
  })

  it("accepts lengths within the tolerance", () => {
    const [match] = rankLyricsMatches([timed("Hello", "Adele", VIDEO + DURATION_TOLERANCE_SECONDS)], {
      title: "Hello",
      artist: "Adele",
      videoDuration: VIDEO,
    })

    expect(match.timingMatches).toBe(true)
  })

  it("leaves timing unknown without the video's length", () => {
    const [match] = rankLyricsMatches([timed("Hello", "Adele", 295)], { title: "Hello", artist: "Adele" })

    expect(match.timingMatches).toBeNull()
    expect(match.durationDelta).toBeNull()
  })
})

describe("autoPick", () => {
  const VIDEO = 273
  const rank = (results: ReturnType<typeof timed>[], videoDuration: number | null = VIDEO) =>
    rankLyricsMatches(results, { title: "Hello", artist: "Adele", videoDuration })

  it("picks the right song timed for this video", () => {
    expect(autoPick(rank([timed("Hello", "Adele", 330), timed("Hello", "Adele", 274)]))?.result.duration).toBe(274)
  })

  it("picks nothing when the right song is timed for a different cut", () => {
    expect(autoPick(rank([timed("Hello", "Adele", 330)]))).toBeNull()
  })

  it("picks nothing when only another song has the right length", () => {
    expect(autoPick(rank([timed("Hello", "Lionel Richie", VIDEO)]))).toBeNull()
  })

  it("picks nothing without the video's length", () => {
    expect(autoPick(rank([timed("Hello", "Adele", 273)], null))).toBeNull()
  })
})
