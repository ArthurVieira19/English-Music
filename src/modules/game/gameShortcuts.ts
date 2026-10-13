export type GameShortcutAction = "togglePlayback" | "replayLine" | "skipLine" | "rewind5"

/** The subset of KeyboardEvent the resolver reads — keeps it testable without a DOM. */
export interface ShortcutKeyEvent {
  code: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  repeat: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  target: EventTarget | null
}

const ACTION_BY_CODE: Record<string, GameShortcutAction> = {
  Space: "togglePlayback",
  KeyP: "togglePlayback",
  KeyR: "replayLine",
  KeyS: "skipLine",
  KeyB: "rewind5",
}

/** Space is only a shortcut when nothing else is using it, so it's left out of the Alt chords. */
const ALT_CODES_EXCLUDED = new Set(["Space"])

/** Elements that already do something with plain keys (typing, Space/Enter activation). */
const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, a[href], summary, [contenteditable], [role='button'], [role='dialog'], [role='menu'], [role='listbox']"

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false
  return (target as Element).closest(INTERACTIVE_SELECTOR) !== null
}

/**
 * Maps a key press on the game screen to a transport action, or null if it
 * isn't one. Two layers, so the shortcuts work without ever fighting the
 * player's typing:
 *  - `Alt` + key works everywhere, including while typing in a blank;
 *  - the bare key only works when focus isn't on something interactive
 *    (an input, button, link…), so typing "r" in a blank never replays.
 * Uses `code` (physical key), not `key`, because Alt+letter produces
 * a different character on macOS keyboards.
 */
export function resolveGameShortcut(event: ShortcutKeyEvent): GameShortcutAction | null {
  if (event.repeat || event.isComposing || event.defaultPrevented) return null
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null

  const action = ACTION_BY_CODE[event.code]
  if (!action) return null

  if (event.altKey) return ALT_CODES_EXCLUDED.has(event.code) ? null : action
  return isInteractiveTarget(event.target) ? null : action
}

/** Human-readable list for the on-screen legend — single source of truth next to the mapping. */
export const GAME_SHORTCUT_LEGEND: { keys: string; label: string }[] = [
  { keys: "Alt + R", label: "Replay line" },
  { keys: "Alt + P", label: "Play / pause" },
  { keys: "Alt + B", label: "Back 5s" },
  { keys: "Alt + S", label: "Skip line" },
  // Handled by the blank itself (exercise-line.tsx), only while it's empty.
  { keys: "Backspace", label: "Replay (in an empty blank)" },
  { keys: "Enter", label: "Skip word (in an empty blank)" },
]
