import type { Achievement } from "@/types/Achievement"
import type { Settings } from "@/types/Settings"
import type { Song } from "@/types/Song"
import type { Statistics } from "@/types/Statistics"
import type { UserProgress } from "@/types/UserProgress"
import type { WeakWord } from "@/types/WeakWord"
import { scheduleRemoteSync } from "@/services/supabase/userDataSync"
import { readJSON, removeKey, writeJSON } from "./localStorageClient"
import { LEGACY_CUSTOM_SONGS_KEY, STORAGE_KEYS } from "./storageKeys"

const THEME_REVISION = 2

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  defaultDifficulty: "beginner",
  defaultGameMode: "typing",
  fuzzyMatching: true,
  // Light is the brand (white like the English Cafe Club logo, see DESIGN.md);
  // following the OS by default would flip dark-OS visitors out of it.
  theme: "light",
  themeRevision: THEME_REVISION,
}

/**
 * Settings saved before the rebrand carry `theme: "dark"` only because dark
 * was the old default, so they move to light once. The revision is kept from
 * then on, so a player who picks Dark again keeps it.
 */
export function migrateTheme(settings: Settings): Settings {
  if ((settings.themeRevision ?? 0) >= THEME_REVISION) return settings
  return { ...settings, theme: settings.theme === "dark" ? "light" : settings.theme, themeRevision: THEME_REVISION }
}

export const DEFAULT_STATISTICS: Statistics = {
  songsCompleted: 0,
  averageAccuracy: 0,
  bestScore: 0,
  totalPlayTimeMs: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedAt: null,
  history: [],
}

export const DEFAULT_PROGRESS: UserProgress = {
  xp: 0,
  level: 1,
  streak: 0,
  longestStreak: 0,
  lastActiveAt: null,
  completedSongIds: [],
  unlockedAchievementIds: [],
  activityDays: [],
  wordsMastered: 0,
}

/**
 * Synchronous, LocalStorage-backed cache of the signed-in player's data. The
 * database is the source of truth: every save also queues a debounced upsert
 * to Supabase (a no-op until someone is signed in), and userDataSync refills
 * this cache from the database on login.
 */
export const storageService = {
  getSettings(): Settings {
    return migrateTheme(readJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS))
  },
  saveSettings(settings: Settings): void {
    writeJSON(STORAGE_KEYS.settings, settings)
    scheduleRemoteSync()
  },

  getStatistics(): Statistics {
    return readJSON(STORAGE_KEYS.statistics, DEFAULT_STATISTICS)
  },
  saveStatistics(statistics: Statistics): void {
    writeJSON(STORAGE_KEYS.statistics, statistics)
    scheduleRemoteSync()
  },

  getProgress(): UserProgress {
    // Merged with defaults (not just substituted) so progress saved before a
    // field like `activityDays`/`wordsMastered` existed still comes back
    // valid instead of `undefined` at runtime despite the type saying `[]`/`0`.
    return { ...DEFAULT_PROGRESS, ...readJSON(STORAGE_KEYS.progress, DEFAULT_PROGRESS) }
  },
  saveProgress(progress: UserProgress): void {
    writeJSON(STORAGE_KEYS.progress, progress)
    scheduleRemoteSync()
  },

  getAchievements(): Achievement[] {
    return readJSON<Achievement[]>(STORAGE_KEYS.achievements, [])
  },
  saveAchievements(achievements: Achievement[]): void {
    writeJSON(STORAGE_KEYS.achievements, achievements)
    scheduleRemoteSync()
  },

  getWeakWords(): WeakWord[] {
    return readJSON<WeakWord[]>(STORAGE_KEYS.weakWords, [])
  },
  saveWeakWords(weakWords: WeakWord[]): void {
    writeJSON(STORAGE_KEYS.weakWords, weakWords)
    scheduleRemoteSync()
  },

  /** Songs added in the browser before accounts existed — read once, to migrate them to the global library. */
  getLegacyCustomSongs(): Song[] {
    return readJSON<Song[]>(LEGACY_CUSTOM_SONGS_KEY, [])
  },
  clearLegacyCustomSongs(): void {
    removeKey(LEGACY_CUSTOM_SONGS_KEY)
  },

  /** Wipes the local cache only. Use `resetProgress` (userDataSync) to also erase the database copy. */
  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(removeKey)
  },
}
