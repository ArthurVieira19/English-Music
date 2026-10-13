import { afterEach, describe, expect, it, vi } from "vitest"
import { lookupYoutubeVideo } from "./youtubeOEmbed"

function response(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("lookupYoutubeVideo", () => {
  it("returns the title and channel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { title: "Adele - Hello", author_name: "AdeleVEVO" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(lookupYoutubeVideo("YQHsXMglC9A")).resolves.toEqual({
      ok: true,
      info: { title: "Adele - Hello", channel: "AdeleVEVO" },
    })
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent("watch?v=YQHsXMglC9A"))
  })

  it("reports a video that doesn't exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(404)))

    await expect(lookupYoutubeVideo("xxxxxxxxxxx")).resolves.toEqual({ ok: false, reason: "not-found" })
  })

  it("reports a private or non-embeddable video, which couldn't play in the game", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)))

    await expect(lookupYoutubeVideo("xxxxxxxxxxx")).resolves.toEqual({ ok: false, reason: "restricted" })
  })

  it("treats a network failure or odd response as unavailable, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    await expect(lookupYoutubeVideo("x")).resolves.toEqual({ ok: false, reason: "unavailable" })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, { nope: true })))
    await expect(lookupYoutubeVideo("x")).resolves.toEqual({ ok: false, reason: "unavailable" })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(500)))
    await expect(lookupYoutubeVideo("x")).resolves.toEqual({ ok: false, reason: "unavailable" })
  })
})
