// Phones don't tell a page that the on-screen keyboard is open. Neither iOS
// Safari nor Chrome on Android (by default) shrink the layout viewport or
// `dvh` for it: the keyboard just covers the bottom of the page. What does
// shrink is the visual viewport, so that is what these helpers read.

/** A smaller drop is a browser toolbar collapsing or the suggestion strip, not a keyboard. */
export const KEYBOARD_MIN_HEIGHT_PX = 120

export interface ViewportSize {
  width: number
  /** Visible height in CSS px at 1x zoom (visualViewport.height * scale), so pinch-zoom isn't read as a keyboard. */
  height: number
}

/**
 * The tallest the viewport has been at this width: the height with no
 * keyboard. Rotating the phone (a new width) starts over.
 */
export function nextBaseline(previous: ViewportSize | null, current: ViewportSize): ViewportSize {
  if (!previous || previous.width !== current.width) return current
  return current.height > previous.height ? current : previous
}

/**
 * True when a text field has focus and the visible area has shrunk by at
 * least a keyboard's height. Needing both keeps a hardware keyboard (focus,
 * no shrink) and a resized window (shrink, no focus) out.
 */
export function isKeyboardOpen({
  baselineHeight,
  viewportHeight,
  textFieldFocused,
}: {
  baselineHeight: number
  viewportHeight: number
  textFieldFocused: boolean
}): boolean {
  return textFieldFocused && baselineHeight - viewportHeight >= KEYBOARD_MIN_HEIGHT_PX
}

/** Fields that bring up the on-screen keyboard. */
export function isTextField(element: Element | null): boolean {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled
  if (element instanceof HTMLInputElement) {
    const nonText = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]
    return !nonText.includes(element.type) && !element.readOnly && !element.disabled
  }
  return element instanceof HTMLElement && element.isContentEditable === true
}
