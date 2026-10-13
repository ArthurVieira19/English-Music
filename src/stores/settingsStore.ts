import { create } from "zustand"
import type { Settings } from "@/types/Settings"
import { DEFAULT_SETTINGS, storageService } from "@/services/storage/storageService"
import { clampOffset } from "@/modules/game/syncOffset"

interface SettingsState {
  settings: Settings
}

interface SettingsActions {
  loadFromStorage: () => void
  updateSettings: (partial: Partial<Settings>) => void
  /** The saved lyric sync correction for a song, in seconds (0 when never adjusted). */
  getSongOffset: (songId: string) => number
  /** Saves a song's lyric sync correction. Zero removes the entry, so settings don't fill up with no-ops. */
  setSongOffset: (songId: string, seconds: number) => void
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loadFromStorage: () => set({ settings: storageService.getSettings() }),
  updateSettings: (partial) => {
    const settings = { ...get().settings, ...partial }
    storageService.saveSettings(settings)
    set({ settings })
  },
  getSongOffset: (songId) => clampOffset(get().settings.songOffsets?.[songId] ?? 0),
  setSongOffset: (songId, seconds) => {
    const offsets = { ...get().settings.songOffsets }
    const offset = clampOffset(seconds)

    if (offset === 0) delete offsets[songId]
    else offsets[songId] = offset

    get().updateSettings({ songOffsets: offsets })
  },
}))
