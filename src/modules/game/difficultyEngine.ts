import { createSeededRandom, hashStringToSeed, seededShuffle } from "./seededRandom"
import { rankWordsByPriority, type RankedWord } from "./wordPriority"

/** How many words at the start of a line are kept visible (except when every word is hidden). */
export const LEADING_WORDS_TO_SKIP = 2

/**
 * Unused time a line can pass on to the next, in blanks' worth. Without a cap,
 * a long instrumental break (counted as the line's duration) would dump a
 * pile of blanks onto the first sung line after it.
 */
export const MAX_CARRIED_BLANKS = 2

/**
 * The words in a line the engine may hide, most meaningful first. The opening
 * words of a line arrive while the player is still catching up with the
 * previous one, so they are left out unless that would leave nothing — or
 * unless every word is being hidden anyway.
 */
export function hidingCandidates(words: string[], hideAll = false): RankedWord[] {
  const ranked = rankWordsByPriority(words)
  if (hideAll) return ranked

  const afterLineStart = ranked.filter((r) => r.index >= LEADING_WORDS_TO_SKIP)
  return afterLineStart.length > 0 ? afterLineStart : ranked
}

export interface LineBudget {
  /** Seconds the line spends on screen. */
  durationSeconds: number
  /** How many of its words could be hidden (see hidingCandidates). */
  candidates: number
}

/**
 * Decides how many blanks each line gets so that, across the song, one blank
 * comes up every `secondsPerBlank` seconds. Time is banked line by line: a
 * short line may get none and pass its time on, a long one may get several.
 * This keeps the pace of questions steady whether the song is a fast rap or a
 * slow ballad — a fixed share of each line's words can't.
 *
 * `secondsPerBlank` of 0 or less means every candidate is hidden.
 */
export function allocateBlanksByTime(lines: LineBudget[], secondsPerBlank: number): number[] {
  if (secondsPerBlank <= 0) return lines.map((line) => line.candidates)

  const maxCarry = secondsPerBlank * MAX_CARRIED_BLANKS
  let banked = 0

  const counts = lines.map((line) => {
    banked += Math.max(0, line.durationSeconds)
    const count = Math.min(line.candidates, Math.floor(banked / secondsPerBlank))
    banked = Math.min(banked - count * secondsPerBlank, maxCarry)
    return count
  })

  // A very short song at a gentle level could bank too little for a single
  // blank; it still needs one to be a game. Give it to the roomiest line.
  if (!counts.some((count) => count > 0)) {
    let roomiest = -1
    lines.forEach((line, index) => {
      if (line.candidates > 0 && (roomiest < 0 || line.candidates > lines[roomiest].candidates)) roomiest = index
    })
    if (roomiest >= 0) counts[roomiest] = 1
  }

  return counts
}

/**
 * Picks `count` words from one priority tier. With no `avoid` set that is a
 * plain seeded shuffle. With one, words the song has already hidden elsewhere
 * (a repeated chorus line) go to the back of the queue, so each blank teaches
 * a new word whenever the tier has enough of them.
 */
function pickFromTier(
  tierWords: RankedWord[],
  count: number,
  rng: () => number,
  avoid?: ReadonlySet<string>,
): RankedWord[] {
  if (tierWords.length <= count) return tierWords
  if (!avoid || avoid.size === 0) return seededShuffle(tierWords, rng).slice(0, count)

  const fresh = tierWords.filter((item) => !avoid.has(item.word.toLowerCase()))
  const repeated = tierWords.filter((item) => avoid.has(item.word.toLowerCase()))

  return [...seededShuffle(fresh, rng), ...seededShuffle(repeated, rng)].slice(0, count)
}

function groupByPriorityTier(ranked: RankedWord[]): Map<number, RankedWord[]> {
  const tiers = new Map<number, RankedWord[]>()

  for (const item of ranked) {
    const tier = tiers.get(item.priority)
    if (tier) {
      tier.push(item)
    } else {
      tiers.set(item.priority, [item])
    }
  }

  return tiers
}

export interface SelectWordsOptions {
  /** Hide every candidate, leading words included (expert). `count` is ignored. */
  hideAll?: boolean
  /** Lowercase words the song already hid on earlier lines; preferred against within a tier. */
  avoid?: ReadonlySet<string>
}

/**
 * Selects which word indices in a line get hidden. Higher-priority word tiers
 * (verbs, then nouns, ...) are always exhausted before lower tiers are
 * touched, so the most meaningful words are hidden first. Seeded randomness
 * only breaks ties within a tier when it must be split, keeping the same
 * line + seed deterministic.
 *
 * `avoid` only reorders choices *within* a tier and never changes how many
 * words are hidden, so difficulty stays the same while vocabulary breadth
 * improves.
 */
export function selectWordsToHide(
  words: string[],
  count: number,
  seed: string,
  options: SelectWordsOptions = {},
): number[] {
  const candidates = hidingCandidates(words, options.hideAll)
  if (options.hideAll) return candidates.map((c) => c.index).sort((a, b) => a - b)

  const wanted = Math.min(candidates.length, Math.max(0, Math.floor(count)))
  if (wanted === 0) return []

  const tiers = groupByPriorityTier(candidates)
  const tierKeysDesc = [...tiers.keys()].sort((a, b) => b - a)
  const rng = createSeededRandom(hashStringToSeed(seed))

  const selected: RankedWord[] = []
  for (const key of tierKeysDesc) {
    const remaining = wanted - selected.length
    if (remaining <= 0) break
    selected.push(...pickFromTier(tiers.get(key) as RankedWord[], remaining, rng, options.avoid))
  }

  return selected.map((s) => s.index).sort((a, b) => a - b)
}
