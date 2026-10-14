"use client"

import { Keyboard, LayoutGrid, ListChecks } from "lucide-react"
import type { Song } from "@/types/Song"
import type { GameMode } from "@/types/GameMode"
import { useSettingsStore } from "@/stores/settingsStore"
import { SetupOption, SetupStep } from "@/components/setup-step"

interface GameModeOption {
  value: GameMode
  label: string
  description: string
  icon: React.ReactNode
  tone: string
}

const GAME_MODE_OPTIONS: GameModeOption[] = [
  {
    value: "typing",
    label: "Typing",
    description: "Type each missing word yourself, letter by letter.",
    icon: <Keyboard className="size-5" />,
    tone: "text-primary",
  },
  {
    value: "multipleChoice",
    label: "Choice",
    description: "Pick the missing word from 4 options.",
    icon: <ListChecks className="size-5" />,
    tone: "text-secondary",
  },
  {
    value: "wordBank",
    label: "Word bank",
    description: "Every option is a word the song is about to ask for. Listen for which one comes now.",
    icon: <LayoutGrid className="size-5" />,
    tone: "text-tier-2",
  },
]

export function GameModeSelector({
  song,
  onSelect,
}: {
  song: Song
  onSelect: (mode: GameMode) => void
}) {
  const lastUsed = useSettingsStore((s) => s.settings.defaultGameMode)

  return (
    <SetupStep song={song} step={1} totalSteps={2} question="How do you want to fill in the blanks?">
      <div role="group" aria-label="Choose a game mode" className="flex flex-col gap-3">
        {GAME_MODE_OPTIONS.map(({ value, label, description, icon, tone }, index) => (
          <SetupOption
            key={value}
            index={index}
            icon={icon}
            label={label}
            description={description}
            tone={tone}
            badge={value === lastUsed ? "Last used" : undefined}
            onClick={() => onSelect(value)}
          />
        ))}
      </div>
    </SetupStep>
  )
}
