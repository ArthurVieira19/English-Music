import { describe, expect, it } from "vitest"
import { artistFromChannel, parseVideoTitle, youtubeSearchUrl } from "./parseVideoTitle"

describe("parseVideoTitle", () => {
  it.each([
    ["Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)", "Rick Astley", "Never Gonna Give You Up"],
    ["Adele - Hello (Official Music Video)", "Adele", "Hello"],
    ["The Weeknd – Blinding Lights [Official Audio]", "The Weeknd", "Blinding Lights"],
    ["Coldplay - Yellow (Official Video) | Coldplay", "Coldplay", "Yellow"],
    ["Ed Sheeran - Perfect [Lyrics]", "Ed Sheeran", "Perfect"],
    ["Imagine Dragons - Believer (Lyric Video)", "Imagine Dragons", "Believer"],
    ["Daft Punk - Get Lucky ft. Pharrell Williams (Official Audio)", "Daft Punk", "Get Lucky"],
    ["Bruno Mars - Uptown Funk (feat. Mark Ronson) [Official Video]", "Bruno Mars", "Uptown Funk"],
    ["Queen - Bohemian Rhapsody (Legendado / Tradução)", "Queen", "Bohemian Rhapsody"],
  ])("splits %j", (video, artist, title) => {
    expect(parseVideoTitle(video)).toEqual({ artist, title })
  })

  it("keeps a bracketed part that is really part of the song's name", () => {
    expect(parseVideoTitle("Pink Floyd - Another Brick in the Wall (Part 2)")).toEqual({
      artist: "Pink Floyd",
      title: "Another Brick in the Wall (Part 2)",
    })
  })

  it("keeps a hyphenated title intact", () => {
    expect(parseVideoTitle("Lady Gaga - Bad Romance").title).toBe("Bad Romance")
    expect(parseVideoTitle("Jay-Z - Empire State of Mind").artist).toBe("Jay-Z")
  })

  it("reads an Artist \"Title\" layout", () => {
    expect(parseVideoTitle('Michael Jackson "Billie Jean" (Official Video)')).toEqual({
      artist: "Michael Jackson",
      title: "Billie Jean",
    })
  })

  it("falls back to the channel for the artist when the title names only the song", () => {
    expect(parseVideoTitle("Shape of You (Official Video)", "Ed Sheeran")).toEqual({
      artist: "Ed Sheeran",
      title: "Shape of You",
    })
  })

  it("leaves the artist empty when nothing names it", () => {
    expect(parseVideoTitle("Shape of You")).toEqual({ artist: "", title: "Shape of You" })
  })
})

describe("artistFromChannel", () => {
  it("cleans up the usual channel name decorations", () => {
    expect(artistFromChannel("Adele - Topic")).toBe("Adele")
    expect(artistFromChannel("TaylorSwiftVEVO")).toBe("Taylor Swift")
    expect(artistFromChannel("Coldplay Official")).toBe("Coldplay")
    expect(artistFromChannel("Imagine Dragons")).toBe("Imagine Dragons")
  })
})

describe("youtubeSearchUrl", () => {
  it("searches for the official video of the song", () => {
    expect(youtubeSearchUrl("Hello", "Adele")).toBe(
      "https://www.youtube.com/results?search_query=Adele%20Hello%20official%20video",
    )
  })

  it("works with only one of the two filled in", () => {
    expect(youtubeSearchUrl("Hello", "  ")).toContain("search_query=Hello%20official%20video")
  })
})
