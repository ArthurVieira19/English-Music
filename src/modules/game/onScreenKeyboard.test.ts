// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { KEYBOARD_MIN_HEIGHT_PX, isKeyboardOpen, isTextField, nextBaseline } from "./onScreenKeyboard"

describe("nextBaseline", () => {
  it("keeps the tallest height seen at the same width", () => {
    const full = { width: 393, height: 760 }
    expect(nextBaseline(full, { width: 393, height: 420 })).toBe(full)
    expect(nextBaseline(full, { width: 393, height: 800 })).toEqual({ width: 393, height: 800 })
  })

  it("starts over when the width changes (the phone was rotated)", () => {
    expect(nextBaseline({ width: 393, height: 760 }, { width: 852, height: 360 })).toEqual({ width: 852, height: 360 })
  })

  it("takes the first reading as the baseline", () => {
    expect(nextBaseline(null, { width: 393, height: 760 })).toEqual({ width: 393, height: 760 })
  })
})

describe("isKeyboardOpen", () => {
  it("is open when a field has focus and the view lost a keyboard's height", () => {
    expect(isKeyboardOpen({ baselineHeight: 760, viewportHeight: 420, textFieldFocused: true })).toBe(true)
  })

  it("ignores a small drop, like the browser toolbar collapsing", () => {
    expect(
      isKeyboardOpen({ baselineHeight: 760, viewportHeight: 760 - KEYBOARD_MIN_HEIGHT_PX + 1, textFieldFocused: true }),
    ).toBe(false)
  })

  it("needs a focused field (a resized window isn't a keyboard)", () => {
    expect(isKeyboardOpen({ baselineHeight: 760, viewportHeight: 420, textFieldFocused: false })).toBe(false)
  })

  it("needs the view to shrink (a hardware keyboard covers nothing)", () => {
    expect(isKeyboardOpen({ baselineHeight: 760, viewportHeight: 760, textFieldFocused: true })).toBe(false)
  })
})

describe("isTextField", () => {
  it("accepts text inputs and textareas", () => {
    expect(isTextField(document.createElement("input"))).toBe(true)
    expect(isTextField(document.createElement("textarea"))).toBe(true)
  })

  it("rejects buttons, checkboxes and disabled fields", () => {
    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    const disabled = document.createElement("input")
    disabled.disabled = true
    expect(isTextField(document.createElement("button"))).toBe(false)
    expect(isTextField(checkbox)).toBe(false)
    expect(isTextField(disabled)).toBe(false)
    expect(isTextField(null)).toBe(false)
  })
})
