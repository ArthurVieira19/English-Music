import Link from "next/link"
import type { ReactNode } from "react"
import { BrandLogo } from "@/components/brand-logo"
import { LyricDemo } from "@/components/lyric-demo"

const FEATURES = [
  { title: "Real music videos", body: "Lyrics synced to the video, blanks where you listen hardest." },
  { title: "Misses come back", body: "Spaced review turns slips into words you keep." },
  { title: "Streaks and ranks", body: "XP, daily streaks and a weekly leaderboard." },
]

/** Four bars bouncing like a level meter: the "a song is playing" cue. Static with reduced motion. */
function Equalizer() {
  return (
    <span aria-hidden className="flex h-3.5 items-end gap-[3px]">
      {[0.9, 0.5, 1, 0.65].map((peak, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-(--stage-red) motion-safe:animate-[eq_1.1s_ease-in-out_infinite]"
          style={{ height: `${peak * 100}%`, animationDelay: `${i * -0.27}s` }}
        />
      ))}
    </span>
  )
}

/**
 * Shared frame for the login and sign-up pages. On wide screens the left half
 * is the brand's navy stage: the logo and one lyric line playing itself, so
 * it shows what the game is. On phones a shorter navy band sits above the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="navy-stage relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <Link href="/login" className="w-fit rounded-xl" aria-label="English Cafe Club">
          <BrandLogo surface="navy" priority className="h-32 xl:h-36" />
        </Link>

        <div className="max-w-lg">
          <p className="flex items-center gap-2.5 text-sm font-medium text-(--stage-muted)">
            <Equalizer />
            Listen. Catch the word. Score.
          </p>
          <LyricDemo onNavy className="mt-4 min-h-[5.5rem]" />
        </div>

        <ul className="grid max-w-lg grid-cols-3 gap-6 border-t border-(--stage-line) pt-6 text-sm">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <p className="font-semibold">{feature.title}</p>
              <p className="mt-1 text-(--stage-muted)">{feature.body}</p>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex flex-col">
        <div className="navy-stage flex flex-col items-center gap-5 rounded-b-2xl px-6 pt-8 pb-7 lg:hidden">
          <BrandLogo surface="navy" priority className="h-24" />
          <LyricDemo onNavy className="min-h-[4.5rem] text-center [&_p]:text-xl" />
        </div>

        <div className="flex flex-1 flex-col px-4 py-10 sm:px-8 lg:justify-center">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-muted-foreground">{subtitle}</p>

            <div className="mt-7">{children}</div>

            <p className="mt-6 text-sm text-muted-foreground">{footer}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
