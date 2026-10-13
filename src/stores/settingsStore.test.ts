// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "@/services/storage/storageService"
import { MAX_SYNC_OFFSET } from "@/modules/game/syncOffset"
import { useSettingsStore } from "./settingsStore"

describe("settingsStore song offsets", () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  })

  it("reads 0 for a song that was never adjusted", () => {
    expect(useSettingsStore.getState().getSongOffset("song-1")).toBe(0)
  })

  it("saves an offset per song without touching other songs or settings", () => {
    const { setSongOffset } = useSettingsStore.getState()
    setSongOffset("song-1", 2.5)
    setSongOffset("song-2", -1)

    const state = useSettingsStore.getState()
    expect(state.getSongOffset("song-1")).toBe(2.5)
    expect(state.getSongOffset("song-2")).toBe(-1)
    expect(state.settings.volume).toBe(DEFAULT_SETTINGS.volume)
  })

  it("persists to the same storage the settings page reads", () => {
    useSettingsStore.getState().setSongOffset("song-1", 3)
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS })

    useSettingsStore.getState().loadFromStorage()

    expect(useSettingsStore.getState().getSongOffset("song-1")).toBe(3)
  })

  it("removes the entry when the offset goes back to zero", () => {
    const { setSongOffset } = useSettingsStore.getState()
    setSongOffset("song-1", 2)
    setSongOffset("song-1", 0)

    expect(useSettingsStore.getState().settings.songOffsets).toEqual({})
  })

  it("keeps stored offsets in range", () => {
    useSettingsStore.getState().setSongOffset("song-1", 9999)

    expect(useSettingsStore.getState().getSongOffset("song-1")).toBe(MAX_SYNC_OFFSET)
  })

  it("ignores a corrupt stored value", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, songOffsets: { "song-1": Number.NaN } },
    })

    expect(useSettingsStore.getState().getSongOffset("song-1")).toBe(0)
  })

  it("still loads settings saved before offsets existed", () => {
    localStorage.setItem("songgap:v1:settings", JSON.stringify(DEFAULT_SETTINGS))

    useSettingsStore.getState().loadFromStorage()

    expect(useSettingsStore.getState().getSongOffset("anything")).toBe(0)
  })
})
