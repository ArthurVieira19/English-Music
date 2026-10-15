import type { WeakWordRef } from "@/types/WeakWord"

/**
 * What makes two missed words the same thing to relearn: the same word, in the
 * same line, of the same song. "Love" missed in two songs is two entries, each
 * with its own clip and its own spaced-repetition ladder; a chorus that comes
 * round four times in one song is still one. The line is compared by its text
 * (not its time), so the repeats of a chorus land on the same entry.
 */
export function weakWordKey(ref: WeakWordRef): string {
  const line = ref.contextText.split(/\s+/).filter((token) => token.length > 0).join(" ").toLowerCase()
  return [ref.songId, ref.word, line].join("\u001f")
}
