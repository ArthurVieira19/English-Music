// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"
import { DifficultySelector } from "./difficulty-selector"
import type { Song } from "@/types/Song"
import { DEFAULT_SETTINGS } from "@/services/storage/storageService"
import { useSettingsStore } from "@/stores/settingsStore"

const song: Song = {
  id: "test-song",
  title: "Test Song",
  artist: "Test Artist",
  youtubeId: "abc12345678",
  thumbnail: "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg",
  difficulty: "beginner",
  lyrics: [
    { start: 0, end: 4, text: "The quick brown fox jumps over" },
    { start: 4, end: 8, text: "The lazy dog sleeps again today" },
  ],
}

describe("DifficultySelector", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  })

  it("renders the song title and artist", () => {
    render(<DifficultySelector song={song} onSelect={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Test Song" })).toBeInTheDocument()
    expect(screen.getByText("Test Artist")).toBeInTheDocument()
  })

  it("renders all four difficulty options with a word-count hint", () => {
    render(<DifficultySelector song={song} onSelect={vi.fn()} />)
    const group = screen.getByRole("group", { name: "Choose a level" })
    const buttons = within(group).getAllByRole("button")

    expect(buttons).toHaveLength(4)
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Beginner"),
      expect.stringContaining("Intermediate"),
      expect.stringContaining("Advanced"),
      expect.stringContaining("Expert"),
    ])
    buttons.forEach((button) => {
      expect(button.textContent).toMatch(/Fill in \d+ of \d+ words/)
    })
  })

  it("calls onSelect with the level a row offers", () => {
    const onSelect = vi.fn()
    render(<DifficultySelector song={song} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: /expert/i }))
    expect(onSelect).toHaveBeenCalledWith({ difficulty: "expert", stage: 1 })

    fireEvent.click(screen.getByRole("button", { name: /beginner/i }))
    expect(onSelect).toHaveBeenCalledWith({ difficulty: "beginner", stage: 1 })
  })

  it("offers stage 1 of every tier to a new player, marking beginner as their level", () => {
    render(<DifficultySelector song={song} onSelect={vi.fn()} />)
    const buttons = within(screen.getByRole("group", { name: "Choose a level" })).getAllByRole("button")

    expect(buttons[0]).toHaveTextContent("Beginner 1")
    expect(buttons[0]).toHaveTextContent("Your level")
    expect(buttons[1]).toHaveTextContent("Intermediate 1")
    expect(buttons[3]).toHaveTextContent("Expert")
  })

  it("offers the player's own stage, the top of easier tiers and the start of harder ones", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, currentLevel: "intermediate-2" } })
    const onSelect = vi.fn()
    render(<DifficultySelector song={song} onSelect={onSelect} />)
    const buttons = within(screen.getByRole("group", { name: "Choose a level" })).getAllByRole("button")

    expect(buttons[0]).toHaveTextContent("Beginner 3")
    expect(buttons[1]).toHaveTextContent("Intermediate 2")
    expect(buttons[1]).toHaveTextContent("Your level")
    expect(buttons[2]).toHaveTextContent("Advanced 1")

    fireEvent.click(buttons[1])
    expect(onSelect).toHaveBeenCalledWith({ difficulty: "intermediate", stage: 2 })
  })
})
