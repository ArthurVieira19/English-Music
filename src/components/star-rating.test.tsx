// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { StarRating } from "./star-rating"

/** The clipped overlays that paint the filled part of each star. */
function filledWidths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("span[style]")).map((el) => el.style.width)
}

describe("StarRating", () => {
  it("is announced with its value as the accessible name", () => {
    render(<StarRating value={3.5} />)

    expect(screen.getByRole("img", { name: "3.5 out of 5 stars" })).toBeInTheDocument()
  })

  it("fills whole stars fully and a half star halfway", () => {
    const { container } = render(<StarRating value={2.5} />)

    expect(filledWidths(container)).toEqual(["100%", "100%", "50%"])
  })

  it("paints nothing for zero stars", () => {
    const { container } = render(<StarRating value={0} />)

    expect(filledWidths(container)).toEqual([])
  })

  it("fills all five for the maximum", () => {
    const { container } = render(<StarRating value={5} />)

    expect(filledWidths(container)).toEqual(Array(5).fill("100%"))
  })

  it("clamps out-of-range values", () => {
    const over = render(<StarRating value={9} />)
    expect(over.getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument()
    over.unmount()

    render(<StarRating value={-2} />)
    expect(screen.getByRole("img", { name: "0 out of 5 stars" })).toBeInTheDocument()
  })
})
