import type { LyricLine } from "@/types/LyricLine"
import type { WeakWordClip } from "@/types/WeakWord"
import { extractCoreWord } from "@/modules/game/exerciseGenerator"
import { groupLyricLines } from "@/modules/lyrics/groupLyricLines"

/**
 * Turning a missed word back into a playable moment of the song. All times are
 * lyric time (see OffsetMediaPlayer), in seconds.
 */

const EPSILON = 0.001

/** Starts this long before the line, so the player has a moment to get ready (and to hear the lead-up) before the words they must catch. */
export const CLIP_LEAD_IN_SECONDS = 2
/** A one-word line ("Hey!") would otherwise be over before the player's ears are ready. */
export const CLIP_MIN_SECONDS = 1.5
/** A line's end is the next line's start, so one before an instrumental break could run on for ages. */
export const CLIP_MAX_SECONDS = 12

function tokens(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0)
}

function sameText(a: string, b: string): boolean {
  return tokens(a).join(" ") === tokens(b).join(" ")
}

/** The raw lyric lines a grouped line was merged from (groupLyricLines only ever merges consecutive ones). */
function linesWithin(raw: LyricLine[], group: Pick<LyricLine, "start" | "end">): LyricLine[] {
  return raw.filter((line) => line.start >= group.start - EPSILON && line.end <= group.end + EPSILON)
}

export function isValidClip(clip: unknown): clip is WeakWordClip {
  if (typeof clip !== "object" || clip === null) return false
  const { start, end } = clip as Partial<WeakWordClip>
  return Number.isFinite(start) && Number.isFinite(end) && (start as number) >= 0 && (end as number) > (start as number)
}

/**
 * The original lyric line that holds a given word of a grouped line. The game
 * works on chunks of several lines (often 6-14 seconds), which is far more than
 * the player needs to hear again for one missed word; the line itself is the
 * "exact stretch". Words of a group are the words of its source lines in order,
 * so the token index says which line it came from.
 *
 * Returns `null` when the group can't be traced back to the lyrics (they were
 * edited, say), so the caller falls back to the whole group.
 */
export function findSourceLine(raw: LyricLine[], group: LyricLine, tokenIndex: number): LyricLine | null {
  const parts = linesWithin(raw, group)
  if (parts.length === 0 || !sameText(parts.map((part) => part.text).join(" "), group.text)) return null

  let seen = 0
  for (const part of parts) {
    seen += tokens(part.text).length
    if (tokenIndex < seen) return part
  }
  return null
}

/**
 * Finds the line of a song a word was missed in, for words saved before clips
 * were recorded. `contextText` is then a whole grouped chunk; the first of its
 * lines that contains the word is used (it can't tell which one was missed).
 */
export function findClipForWord(
  raw: LyricLine[],
  contextText: string,
  word: string,
): { contextText: string; clip: WeakWordClip } | null {
  const target = word.toLowerCase()
  const hasWord = (text: string) => tokens(text).some((token) => extractCoreWord(token).toLowerCase() === target)
  const toResult = (line: LyricLine) => ({ contextText: line.text, clip: { start: line.start, end: line.end } })

  for (const group of groupLyricLines(raw)) {
    if (!sameText(group.text, contextText)) continue
    const source = linesWithin(raw, group).find((line) => hasWord(line.text))
    if (source) return toResult(source)
  }

  // A context that is already a single lyric line.
  const single = raw.find((line) => sameText(line.text, contextText) && hasWord(line.text))
  return single ? toResult(single) : null
}

/** What to actually play for a clip: a lead-in before the line, never too short, never endless. */
export function clipWindow(clip: WeakWordClip): { from: number; to: number } {
  const to = Math.min(Math.max(clip.end, clip.start + CLIP_MIN_SECONDS), clip.start + CLIP_MAX_SECONDS)
  return { from: Math.max(0, clip.start - CLIP_LEAD_IN_SECONDS), to }
}
