"use client"

import { useMemo } from "react"
import { Skull, Smile, Meh, Frown } from "lucide-react"
import type { Song } from "@/types/Song"
import type { Difficulty } from "@/types/Difficulty"
import { estimateHiddenWordCounts } from "@/modules/game/exerciseGenerator"
import { levelId, levelLabel, offeredLevel, resolveCurrentLevel, type Level } from "@/modules/game/levels"
import { groupLyricLines } from "@/modules/lyrics/groupLyricLines"
import { useSettingsStore } from "@/stores/settingsStore"
import { SetupOption, SetupStep } from "@/components/setup-step"

interface DifficultyOption {
  value: Difficulty
  icon: React.ReactNode
  tone: string
}

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { value: "beginner", icon: <Smile className="size-5" />, tone: "text-secondary" },
  { value: "intermediate", icon: <Meh className="size-5" />, tone: "text-primary" },
  { value: "advanced", icon: <Frown className="size-5" />, tone: "text-orange-400" },
  { value: "expert", icon: <Skull className="size-5" />, tone: "text-destructive" },
]

/**
 * Second setup step. One row per tier, each offering the stage that suits the
 * player (see offeredLevel): their own stage in their tier, the top stage of
 * easier tiers, the first stage of harder ones. Stages beyond that are reached
 * by playing well — see promotionAfter.
 */
export function DifficultySelector({
  song,
  onSelect,
  onBack,
}: {
  song: Song
  onSelect: (level: Level) => void
  onBack?: () => void
}) {
  const counts = useMemo(() => estimateHiddenWordCounts(groupLyricLines(song.lyrics)), [song])
  const total = counts["expert-1"]
  const savedLevel = useSettingsStore((s) => s.settings.currentLevel)
  const fallbackDifficulty = useSettingsStore((s) => s.settings.defaultDifficulty)
  const current = resolveCurrentLevel(savedLevel, fallbackDifficulty)

  return (
    <SetupStep song={song} step={2} totalSteps={2} question="How many words should be hidden?" onBack={onBack}>
      <div role="group" aria-label="Choose a level" className="flex flex-col gap-3">
        {DIFFICULTY_OPTIONS.map(({ value, icon, tone }, index) => {
          const level = offeredLevel(value, current)
          const hidden = counts[levelId(level)]
          return (
            <SetupOption
              key={value}
              index={index}
              icon={icon}
              label={levelLabel(level)}
              description={`Fill in ${hidden} of ${total} words`}
              tone={tone}
              meter={total > 0 ? hidden / total : 0}
              badge={value === current.difficulty ? "Your level" : undefined}
              onClick={() => onSelect(level)}
            />
          )
        })}
      </div>
    </SetupStep>
  )
}
