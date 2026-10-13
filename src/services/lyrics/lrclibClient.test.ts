import { afterEach, describe, expect, it, vi } from "vitest"
import { getSyncedLyricsForLength, searchSyncedLyrics, type LrclibResult } from "./lrclibClient"

function makeResult(overrides: Partial<LrclibResult> = {}): LrclibResult {
  return {
    id: 1,
    trackName: "Die With A Smile",
    artistName: "Bruno Mars",
    albumName: "Bruno Mars Essentials",
    duration: 252,
    instrumental: false,
    plainLyrics: "some lyrics",
    syncedLyrics: "[00:01.00]some lyrics",
    ...overrides,
  }
}

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response
}

describe("searchSyncedLyrics", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the combined track+artist results when they include synced lyrics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([makeResult()]))
    vi.stubGlobal("fetch", fetchMock)

    const results = await searchSyncedLyrics("Die With A Smile", "Bruno Mars")

    expect(results).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain("artist_name=Bruno")
  })

  it("falls back to a track-only search when the combined search finds nothing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([makeResult()]))
    vi.stubGlobal("fetch", fetchMock)

    const results = await searchSyncedLyrics("Die With A Smile", "Bruno Mars e Lady Gaga")

    expect(results).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).not.toContain("artist_name")
  })

  it("filters out results without synced lyrics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([makeResult({ syncedLyrics: null }), makeResult({ id: 2 })]))
    vi.stubGlobal("fetch", fetchMock)

    const results = await searchSyncedLyrics("Die With A Smile", "Bruno Mars")

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(2)
  })

  it("returns an empty array when both the combined and fallback searches find nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal("fetch", fetchMock)

    const results = await searchSyncedLyrics("Some Obscure Song", "Some Obscure Artist")

    expect(results).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws when the API responds with a non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    vi.stubGlobal("fetch", fetchMock)

    await expect(searchSyncedLyrics("Title", "Artist")).rejects.toThrow("500")
  })

  it("searches by track alone when the artist is unknown", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([makeResult()]))
    vi.stubGlobal("fetch", fetchMock)

    await searchSyncedLyrics("Die With A Smile", "  ")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).not.toContain("artist_name")
  })
})

describe("getSyncedLyricsForLength", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("asks for the version timed for that length", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeResult({ duration: 251 })))
    vi.stubGlobal("fetch", fetchMock)

    const result = await getSyncedLyricsForLength("Die With A Smile", "Bruno Mars", 251.4)

    expect(result?.duration).toBe(251)
    expect(fetchMock.mock.calls[0][0]).toContain("/api/get?")
    expect(fetchMock.mock.calls[0][0]).toContain("duration=251")
  })

  it("returns null when lrclib has no such version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as Response))

    await expect(getSyncedLyricsForLength("x", "y", 200)).resolves.toBeNull()
  })

  it("returns null for a version without synced lyrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(makeResult({ syncedLyrics: null }))))

    await expect(getSyncedLyricsForLength("x", "y", 200)).resolves.toBeNull()
  })
})
