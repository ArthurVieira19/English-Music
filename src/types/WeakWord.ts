/** A stretch of a song, in lyric time (seconds) — the same clock the lyrics were timed against. */
export interface WeakWordClip {
  start: number
  end: number
}

/** Where a missed word was last seen, kept so the review screen can replay that exact moment of the song. */
export interface WeakWordContext {
  songId: string
  songTitle: string
  artist: string
  /** The lyric line the word appeared in, for a fill-in-the-blank review card. */
  contextText: string
  /**
   * Where `contextText` is sung in the video. Missing on words saved before
   * clips existed; the review screen finds it again from the song's lyrics.
   */
  clip?: WeakWordClip
}

export interface WeakWord extends WeakWordContext {
  /** Normalized (lowercase, punctuation-stripped) form of the word. The same word missed in another song or line is its own entry (see weakWordKey). */
  word: string
  timesWrong: number
  timesCorrect: number
  /** Index into the spaced-repetition interval ladder; resets to 0 on every miss. */
  intervalIndex: number
  lastSeenAt: number
  /** Epoch ms — the word is due for review once this has passed. */
  nextReviewAt: number
}

/** Enough to tell which tracked entry is meant: a word, in a line of a song. */
export type WeakWordRef = Pick<WeakWord, "songId" | "word" | "contextText">
