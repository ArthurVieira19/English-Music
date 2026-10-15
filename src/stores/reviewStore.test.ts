// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { useReviewStore } from "./reviewStore"
import { useStatsStore } from "./statsStore"
import { SRS_INTERVALS_DAYS } from "@/modules/review/spacedRepetition"
import { DEFAULT_PROGRESS, storageService } from "@/services/storage/storageService"
import type { Song } from "@/types/Song"
import type { WeakWord, WeakWordContext } from "@/types/WeakWord"

const DAY_MS = 24 * 60 * 60 * 1000
const CONTEXT: WeakWordContext = {
  songId: "song-1",
  songTitle: "Die With A Smile",
  artist: "Bruno Mars",
  contextText: "I love you baby and I love you always",
}

/** Points at the entry made by `recordMiss(word, context)`. */
const ref = (word: string, context: WeakWordContext = CONTEXT) => ({
  word,
  songId: context.songId,
  contextText: context.contextText,
})

describe("reviewStore", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useReviewStore.setState({ weakWords: [] })
    useStatsStore.setState({ progress: DEFAULT_PROGRESS })
  })

  it("tracks a missed word and persists it", () => {
    const now = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, now)

    const [word] = useReviewStore.getState().weakWords
    expect(word.word).toBe("love")
    expect(word.timesWrong).toBe(1)
    expect(word.nextReviewAt).toBe(now + SRS_INTERVALS_DAYS[0] * DAY_MS)
    expect(storageService.getWeakWords()).toHaveLength(1)
  })

  it("remembers which moment of the song the word was missed in", () => {
    const clip = { start: 41.5, end: 45 }
    useReviewStore.getState().recordMiss("love", { ...CONTEXT, clip }, 1000)

    expect(useReviewStore.getState().weakWords[0].clip).toEqual(clip)
    expect(storageService.getWeakWords()[0].clip).toEqual(clip)
  })

  describe("one entry per place a word was missed", () => {
    const OTHER_SONG: WeakWordContext = {
      songId: "song-2",
      songTitle: "Another Song",
      artist: "Someone",
      contextText: "all you need is love",
      clip: { start: 80, end: 83 },
    }

    it("keeps the same word missed in two songs apart, each with its own clip", () => {
      useReviewStore.getState().recordMiss("love", { ...CONTEXT, clip: { start: 10, end: 12 } }, 1000)
      useReviewStore.getState().recordMiss("love", OTHER_SONG, 2000)

      const { weakWords } = useReviewStore.getState()
      expect(weakWords).toHaveLength(2)
      expect(weakWords.map((w) => w.clip)).toEqual([
        { start: 10, end: 12 },
        { start: 80, end: 83 },
      ])
    })

    it("keeps the same word missed in two lines of one song apart", () => {
      useReviewStore.getState().recordMiss("love", CONTEXT, 1000)
      useReviewStore.getState().recordMiss("love", { ...CONTEXT, contextText: "love is all around" }, 2000)

      expect(useReviewStore.getState().weakWords).toHaveLength(2)
    })

    it("counts a repeated line (a chorus) as one entry and keeps the latest clip", () => {
      useReviewStore.getState().recordMiss("love", { ...CONTEXT, clip: { start: 10, end: 12 } }, 1000)
      useReviewStore.getState().recordMiss("love", { ...CONTEXT, clip: { start: 90, end: 92 } }, 2000)

      const { weakWords } = useReviewStore.getState()
      expect(weakWords).toHaveLength(1)
      expect(weakWords[0].timesWrong).toBe(2)
      expect(weakWords[0].clip).toEqual({ start: 90, end: 92 })
    })

    it("does not tell lines apart by case or spacing", () => {
      useReviewStore.getState().recordMiss("love", CONTEXT, 1000)
      useReviewStore.getState().recordMiss("love", { ...CONTEXT, contextText: "  I LOVE you baby  and I love you always " }, 2000)

      expect(useReviewStore.getState().weakWords).toHaveLength(1)
    })

    it("only credits the entry for the line the word was heard in", () => {
      const missedAt = 1_000_000
      useReviewStore.getState().recordMiss("love", CONTEXT, missedAt)
      useReviewStore.getState().recordMiss("love", OTHER_SONG, missedAt)
      const dueAt = missedAt + SRS_INTERVALS_DAYS[0] * DAY_MS

      useReviewStore.getState().recordCorrect(ref("love", OTHER_SONG), dueAt)

      const [first, second] = useReviewStore.getState().weakWords
      expect(first.intervalIndex).toBe(0)
      expect(second.intervalIndex).toBe(1)
    })

    it("forgets only the entry it is asked to", () => {
      useReviewStore.getState().recordMiss("love", CONTEXT, 1000)
      useReviewStore.getState().recordMiss("love", OTHER_SONG, 1000)

      useReviewStore.getState().removeWord(ref("love", CONTEXT))

      const { weakWords } = useReviewStore.getState()
      expect(weakWords).toHaveLength(1)
      expect(weakWords[0].songId).toBe("song-2")
      expect(storageService.getWeakWords()).toHaveLength(1)
    })

    it("counts a word as mastered once its last place is cleared, not each one", () => {
      let now = 1_000_000
      useReviewStore.getState().recordMiss("love", CONTEXT, now)
      useReviewStore.getState().recordMiss("love", OTHER_SONG, now)

      for (const days of SRS_INTERVALS_DAYS) {
        now += days * DAY_MS
        useReviewStore.getState().recordCorrect(ref("love", CONTEXT), now)
      }
      expect(useReviewStore.getState().weakWords).toHaveLength(1)
      expect(useStatsStore.getState().progress.wordsMastered).toBe(0)

      for (const days of SRS_INTERVALS_DAYS) {
        now += days * DAY_MS
        useReviewStore.getState().recordCorrect(ref("love", OTHER_SONG), now)
      }
      expect(useReviewStore.getState().weakWords).toHaveLength(0)
      expect(useStatsStore.getState().progress.wordsMastered).toBe(1)
    })
  })

  it("does not grant interval credit for a correct answer before the word is due", () => {
    const missedAt = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, missedAt)

    // A repeated chorus line, seconds later in the same playthrough.
    for (let i = 1; i <= 5; i++) {
      useReviewStore.getState().recordCorrect(ref("love"), missedAt + i * 100)
    }

    const [word] = useReviewStore.getState().weakWords
    expect(useReviewStore.getState().weakWords).toHaveLength(1)
    expect(word.intervalIndex).toBe(0)
    expect(word.nextReviewAt).toBe(missedAt + SRS_INTERVALS_DAYS[0] * DAY_MS)
    expect(word.timesCorrect).toBe(5)
  })

  it("advances the interval when the word was genuinely due", () => {
    const missedAt = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, missedAt)

    const dueAt = missedAt + SRS_INTERVALS_DAYS[0] * DAY_MS
    useReviewStore.getState().recordCorrect(ref("love"), dueAt)

    const [word] = useReviewStore.getState().weakWords
    expect(word.intervalIndex).toBe(1)
    expect(word.nextReviewAt).toBe(dueAt + SRS_INTERVALS_DAYS[1] * DAY_MS)
  })

  it("drops a word from the pool once it clears the whole ladder over time", () => {
    let now = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, now)

    let lastResult = false
    for (const days of SRS_INTERVALS_DAYS) {
      now += days * DAY_MS
      lastResult = useReviewStore.getState().recordCorrect(ref("love"), now)
    }

    expect(lastResult).toBe(true)
    expect(useReviewStore.getState().weakWords).toHaveLength(0)
    expect(storageService.getWeakWords()).toHaveLength(0)
  })

  it("returns false for interval advances that don't yet clear the ladder", () => {
    const missedAt = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, missedAt)
    const dueAt = missedAt + SRS_INTERVALS_DAYS[0] * DAY_MS

    expect(useReviewStore.getState().recordCorrect(ref("love"), dueAt)).toBe(false)
  })

  it("bumps the lifetime wordsMastered counter in statsStore when a word is mastered", () => {
    let now = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, now)

    for (const days of SRS_INTERVALS_DAYS) {
      now += days * DAY_MS
      useReviewStore.getState().recordCorrect(ref("love"), now)
    }

    expect(useStatsStore.getState().progress.wordsMastered).toBe(1)
  })

  it("removeWord drops an entry outright, e.g. a false positive", () => {
    useReviewStore.getState().recordMiss("gucci", CONTEXT, 1000)
    useReviewStore.getState().removeWord(ref("gucci"))

    expect(useReviewStore.getState().weakWords).toHaveLength(0)
    expect(storageService.getWeakWords()).toHaveLength(0)
  })

  it("ignores a correct answer for a word that was never missed", () => {
    useReviewStore.getState().recordCorrect(ref("never-missed"), 5000)
    expect(useReviewStore.getState().weakWords).toHaveLength(0)
  })

  it("dueWords returns only words past their review time", () => {
    const now = 1_000_000
    useReviewStore.getState().recordMiss("love", CONTEXT, now)
    useReviewStore.getState().recordMiss("smile", CONTEXT, now)

    expect(useReviewStore.getState().dueWords(now)).toHaveLength(0)
    expect(useReviewStore.getState().dueWords(now + 2 * DAY_MS)).toHaveLength(2)
  })

  describe("upgradeLegacy", () => {
    const SONG: Song = {
      id: "song-1",
      title: "Die With A Smile",
      artist: "Bruno Mars",
      youtubeId: "yt",
      thumbnail: "",
      difficulty: "beginner",
      lyrics: [
        { start: 10, end: 13, text: "I love you baby" },
        { start: 13, end: 16, text: "and I love you always" },
      ],
    }

    /** What the game used to save: no clip, and the whole chunk it played. */
    function legacy(word: string, overrides: Partial<WeakWord> = {}): WeakWord {
      return {
        ...CONTEXT,
        contextText: "I love you baby and I love you always",
        word,
        timesWrong: 1,
        timesCorrect: 0,
        intervalIndex: 2,
        lastSeenAt: 500,
        nextReviewAt: 900,
        ...overrides,
      }
    }

    it("pins an old word to the line of the song it was missed in, keeping its schedule", () => {
      useReviewStore.setState({ weakWords: [legacy("always")] })

      useReviewStore.getState().upgradeLegacy([SONG])

      const [word] = useReviewStore.getState().weakWords
      expect(word.contextText).toBe("and I love you always")
      expect(word.clip).toEqual({ start: 13, end: 16 })
      expect(word.intervalIndex).toBe(2)
      expect(word.nextReviewAt).toBe(900)
      expect(storageService.getWeakWords()[0].clip).toEqual({ start: 13, end: 16 })
    })

    it("leaves a word alone when its song or line can't be found", () => {
      const lost = legacy("always", { songId: "gone" })
      useReviewStore.setState({ weakWords: [lost] })

      useReviewStore.getState().upgradeLegacy([SONG])

      expect(useReviewStore.getState().weakWords).toEqual([lost])
      expect(storageService.getWeakWords()).toEqual([])
    })

    it("merges an old word into the entry made for the same line since", () => {
      const fresh: WeakWord = {
        ...legacy("always", { timesWrong: 2, timesCorrect: 1, intervalIndex: 0, lastSeenAt: 800, nextReviewAt: 1200 }),
        contextText: "and I love you always",
        clip: { start: 13, end: 16 },
      }
      useReviewStore.setState({ weakWords: [legacy("always", { timesWrong: 3, timesCorrect: 4 }), fresh] })

      useReviewStore.getState().upgradeLegacy([SONG])

      const { weakWords } = useReviewStore.getState()
      expect(weakWords).toHaveLength(1)
      // The schedule of the one seen last, with both histories added up.
      expect(weakWords[0].nextReviewAt).toBe(1200)
      expect(weakWords[0].timesWrong).toBe(5)
      expect(weakWords[0].timesCorrect).toBe(5)
    })

    it("does nothing when every word already has its clip", () => {
      const done = { ...legacy("always"), contextText: "and I love you always", clip: { start: 13, end: 16 } }
      useReviewStore.setState({ weakWords: [done] })

      useReviewStore.getState().upgradeLegacy([SONG])

      expect(storageService.getWeakWords()).toEqual([])
    })

    it("lets the game credit an upgraded word in the same line", () => {
      useReviewStore.setState({ weakWords: [legacy("always")] })
      useReviewStore.getState().upgradeLegacy([SONG])

      const credited = useReviewStore
        .getState()
        .recordCorrect({ word: "always", songId: "song-1", contextText: "and I love you always" }, 900)

      expect(credited).toBe(false)
      expect(useReviewStore.getState().weakWords[0].intervalIndex).toBe(3)
    })
  })
})
