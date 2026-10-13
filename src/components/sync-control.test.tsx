// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SyncControl } from "./sync-control"

function setup(props: Partial<React.ComponentProps<typeof SyncControl>> = {}) {
  const onChange = vi.fn()
  const onTap = vi.fn(() => true)
  const user = userEvent.setup()
  render(<SyncControl offset={0} onChange={onChange} onTap={onTap} {...props} />)
  return { onChange, onTap, user }
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Lyrics sync/ }))
}

describe("SyncControl", () => {
  it("invites the player to fix the sync when nothing was adjusted", () => {
    setup()

    expect(screen.getByRole("button", { name: "Lyrics sync: In sync" })).toHaveTextContent("Lyrics out of sync?")
  })

  it("shows the active correction on the trigger once adjusted", () => {
    setup({ offset: 2.5 })

    expect(screen.getByRole("button", { name: "Lyrics sync: Lyrics 2.5s later" })).toHaveTextContent("Lyrics 2.5s later")
  })

  it("nudges relative to the current offset", async () => {
    const { user, onChange } = setup({ offset: 1 })
    await open(user)

    await user.click(await screen.findByRole("button", { name: "Show lyrics 0.5 seconds later" }))
    await user.click(screen.getByRole("button", { name: "Show lyrics 0.1 seconds earlier" }))

    expect(onChange).toHaveBeenNthCalledWith(1, 1.5)
    expect(onChange).toHaveBeenNthCalledWith(2, 0.9)
  })

  it("calibrates from a tap on the highlighted line", async () => {
    const { user, onTap } = setup()
    await open(user)

    await user.click(await screen.findByRole("button", { name: /Tap when the highlighted line is sung/ }))

    expect(onTap).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Wait for a line to start/)).not.toBeInTheDocument()
  })

  it("explains itself when there is no line to calibrate against", async () => {
    const { user } = setup({ onTap: () => false })
    await open(user)

    await user.click(await screen.findByRole("button", { name: /Tap when the highlighted line is sung/ }))

    expect(screen.getByText(/Wait for a line to start/)).toBeInTheDocument()
  })

  it("resets to the original timing", async () => {
    const { user, onChange } = setup({ offset: -3 })
    await open(user)

    await user.click(await screen.findByRole("button", { name: "Reset to original timing" }))

    expect(onChange).toHaveBeenCalledWith(0)
  })

  it("has nothing to reset when already in sync", async () => {
    const { user } = setup({ offset: 0 })
    await open(user)

    expect(await screen.findByRole("button", { name: "Reset to original timing" })).toBeDisabled()
  })

  it("can be disabled while the player is still loading", () => {
    setup({ disabled: true })

    expect(screen.getByRole("button", { name: /Lyrics sync/ })).toBeDisabled()
  })
})
