"use client"

import { useEffect, useState, type RefObject } from "react"
import { isKeyboardOpen, isTextField, nextBaseline, type ViewportSize } from "@/modules/game/onScreenKeyboard"

/**
 * Focus moves between blanks by unmounting one input and focusing the next a
 * moment later. Waiting this long before calling the keyboard closed keeps
 * the layout from flickering on every handoff.
 */
const CLOSE_DELAY_MS = 150

/**
 * Says whether the phone's on-screen keyboard is open, and keeps two CSS
 * variables on `ref`'s element up to date for laying out around it:
 * `--vvh`, the height still visible above the keyboard, and `--vv-top`, how
 * far the browser has panned the page to show the focused field. Both come
 * from `window.visualViewport`; browsers without it never report a keyboard.
 */
export function useOnScreenKeyboard(ref: RefObject<HTMLElement | null>): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    let baseline: ViewportSize | null = null
    let isOpen = false
    let frame = 0
    let closeTimer: ReturnType<typeof setTimeout> | undefined

    const measure = () => {
      const size = { width: Math.round(viewport.width * viewport.scale), height: viewport.height * viewport.scale }
      baseline = nextBaseline(baseline, size)
      ref.current?.style.setProperty("--vvh", `${viewport.height}px`)
      ref.current?.style.setProperty("--vv-top", `${viewport.offsetTop}px`)
      return isKeyboardOpen({
        baselineHeight: baseline.height,
        viewportHeight: size.height,
        textFieldFocused: isTextField(document.activeElement),
      })
    }

    const commit = (next: boolean) => {
      isOpen = next
      setOpen(next)
    }

    const update = () => {
      frame = 0
      const next = measure()
      if (next) {
        clearTimeout(closeTimer)
        closeTimer = undefined
        if (!isOpen) commit(true)
      } else if (isOpen && closeTimer === undefined) {
        closeTimer = setTimeout(() => {
          closeTimer = undefined
          commit(measure())
        }, CLOSE_DELAY_MS)
      }
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    viewport.addEventListener("resize", schedule)
    viewport.addEventListener("scroll", schedule)
    document.addEventListener("focusin", schedule)
    document.addEventListener("focusout", schedule)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(closeTimer)
      viewport.removeEventListener("resize", schedule)
      viewport.removeEventListener("scroll", schedule)
      document.removeEventListener("focusin", schedule)
      document.removeEventListener("focusout", schedule)
    }
  }, [ref])

  return open
}
