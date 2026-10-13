import type { LyricLine } from "@/types/LyricLine"
import type { ExerciseLine, ExerciseToken } from "@/types/ExerciseLine"
import type { GameMode } from "@/types/GameMode"
import { allocateBlanksByTime, hidingCandidates, selectWordsToHide } from "./difficultyEngine"
import { LEVELS, hidesEveryWord, levelId, secondsPerBlank, type Level, type LevelId } from "./levels"
import { createSeededRandom, hashStringToSeed, seededShuffle } from "./seededRandom"

// Matches the alphabetic (plus apostrophe) core of a token, stripping
// surrounding punctuation — "fox," -> "fox", "(quickly)" -> "quickly".
const CORE_WORD_REGEX = /^[^a-zA-Z']*([a-zA-Z](?:[a-zA-Z']*[a-zA-Z])?)[^a-zA-Z']*$/

export function extractCoreWord(token: string): string {
  const match = token.match(CORE_WORD_REGEX)
  return match ? match[1] : ""
}

/** Builds a deduplicated word pool from a set of lyric lines, for use as multiple-choice distractors. */
export function buildVocabularyPool(lines: LyricLine[]): string[] {
  const words = new Set<string>()

  for (const line of lines) {
    for (const token of line.text.split(/\s+/)) {
      const core = extractCoreWord(token)
      if (core) words.add(core)
    }
  }

  return Array.from(words)
}

export interface GenerateExerciseOptions {
  lineIndex: number
  mode: GameMode
  /** How many words to hide, or "all" to hide every eligible word (expert, which also forces typing). */
  hide: number | "all"
  /** Deterministic seed — same line + same seed must produce the same exercise. */
  seed: string
  /** Number of options shown per hidden word in multiple-choice mode (including the answer). */
  choiceCount?: number
  /** Extra vocabulary (e.g. from the rest of the song) to draw multiple-choice distractors from. */
  distractorPool?: string[]
  /** Lowercase words already hidden on earlier lines of the song; the generator prefers other words. */
  avoidWords?: ReadonlySet<string>
}

function buildChoices(
  answer: string,
  pool: string[],
  seed: string,
  choiceCount: number,
): string[] {
  const distractors = Array.from(
    new Set(pool.filter((word) => word && word.toLowerCase() !== answer.toLowerCase())),
  )

  const rng = createSeededRandom(hashStringToSeed(seed))
  const pickedDistractors = seededShuffle(distractors, rng).slice(0, Math.max(0, choiceCount - 1))

  return seededShuffle([answer, ...pickedDistractors], rng)
}

function tokenize(text: string): { rawTokens: string[]; coreWords: string[] } {
  const rawTokens = text.split(/\s+/).filter((token) => token.length > 0)
  return { rawTokens, coreWords: rawTokens.map(extractCoreWord) }
}

/**
 * Turns a synced lyric line into a playable exercise: tokenizes the line,
 * hides the requested number of words (chosen by the difficulty engine), and
 * — for multiple-choice mode — builds deterministic answer options.
 */
export function generateExerciseLine(
  line: LyricLine,
  options: GenerateExerciseOptions,
): ExerciseLine {
  const { rawTokens, coreWords } = tokenize(line.text)

  const hideAll = options.hide === "all"
  const hiddenIndices = new Set(
    selectWordsToHide(coreWords, hideAll ? 0 : (options.hide as number), options.seed, {
      hideAll,
      avoid: options.avoidWords,
    }),
  )
  const mode: GameMode = hideAll ? "typing" : options.mode
  const distractorPool = options.distractorPool ?? coreWords
  const choiceCount = options.choiceCount ?? 4

  const tokens: ExerciseToken[] = rawTokens.map((raw, index) => {
    if (!hiddenIndices.has(index)) {
      return { index, raw, isHidden: false }
    }

    const answer = coreWords[index]
    const token: ExerciseToken = { index, raw, isHidden: true, answer }

    if (mode === "multipleChoice") {
      token.choices = buildChoices(answer, distractorPool, `${options.seed}:${index}`, choiceCount)
    }

    return token
  })

  return {
    lineIndex: options.lineIndex,
    start: line.start,
    end: line.end,
    text: line.text,
    mode,
    tokens,
  }
}

/**
 * How many blanks each line of a song gets at a level: one per
 * `secondsPerBlank(level)` seconds of music, banked across lines (see
 * allocateBlanksByTime). Expert hides every eligible word.
 */
export function blanksPerLine(lines: LyricLine[], level: Level): number[] {
  const hideAll = hidesEveryWord(level)
  const budgets = lines.map((line) => ({
    durationSeconds: line.end - line.start,
    candidates: hidingCandidates(tokenize(line.text).coreWords, hideAll).length,
  }))
  return allocateBlanksByTime(budgets, secondsPerBlank(level))
}

export interface GenerateSongExercisesOptions {
  level: Level
  mode: GameMode
  /** Each line's seed is `${seedPrefix}:${lineIndex}`. */
  seedPrefix: string
  choiceCount?: number
  distractorPool?: string[]
}

/**
 * Builds the exercises for a whole song, line by line. How many words each
 * line hides comes from the level's pace of blanks per second of music; which
 * words comes from the difficulty engine, steered away from words already
 * hidden earlier — songs repeat their chorus, and hiding "heart" in every
 * repetition drills one word while the rest of the vocabulary goes untouched.
 */
export function generateSongExercises(lines: LyricLine[], options: GenerateSongExercisesOptions): ExerciseLine[] {
  const hideAll = hidesEveryWord(options.level)
  const counts = blanksPerLine(lines, options.level)
  const hiddenSoFar = new Set<string>()

  return lines.map((line, lineIndex) => {
    const exercise = generateExerciseLine(line, {
      lineIndex,
      mode: options.mode,
      hide: hideAll ? "all" : counts[lineIndex],
      seed: `${options.seedPrefix}:${lineIndex}`,
      choiceCount: options.choiceCount,
      distractorPool: options.distractorPool,
      avoidWords: hiddenSoFar,
    })

    for (const token of exercise.tokens) {
      if (token.isHidden && token.answer) hiddenSoFar.add(token.answer.toLowerCase())
    }

    return exercise
  })
}

/**
 * Previews how many words each level would hide across a song, so the level
 * picker can show "fill in X of Y words" before the player commits. Uses the
 * same allocation as generateSongExercises (the seed only decides *which*
 * words, never how many), so the preview always matches the game.
 */
export function estimateHiddenWordCounts(lyrics: LyricLine[]): Record<LevelId, number> {
  const counts = {} as Record<LevelId, number>
  for (const level of LEVELS) {
    counts[levelId(level)] = blanksPerLine(lyrics, level).reduce((sum, n) => sum + n, 0)
  }
  return counts
}
