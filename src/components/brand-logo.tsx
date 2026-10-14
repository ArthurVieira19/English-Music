import Image from "next/image"
import logoLight from "@/assets/brand/logo-light.png"
import logoDark from "@/assets/brand/logo-dark.png"
import { cn } from "@/lib/utils"

/**
 * The English Cafe Club logo, cut out of img/logo-english.jpg (transparent
 * PNGs in src/assets/brand). The light version keeps the logo's own inks; the
 * dark one turns the navy "CLUB" white and lifts the blue and red so they
 * read on navy.
 *
 * `surface="auto"` follows the theme; `surface="navy"` is for the always-navy
 * `.navy-stage` panels, which stay navy in the light theme too.
 */
export function BrandLogo({
  surface = "auto",
  priority = false,
  className,
}: {
  surface?: "auto" | "navy"
  priority?: boolean
  /** Size it by height (e.g. `h-12`); the width follows the logo's aspect ratio. */
  className?: string
}) {
  const imageClass = "h-full w-auto select-none"
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      {surface === "navy" ? (
        <Image src={logoDark} alt="English Cafe Club" priority={priority} className={imageClass} draggable={false} />
      ) : (
        <>
          <Image
            src={logoLight}
            alt="English Cafe Club"
            priority={priority}
            className={cn(imageClass, "dark:hidden")}
            draggable={false}
          />
          <Image
            src={logoDark}
            alt=""
            aria-hidden
            priority={priority}
            className={cn(imageClass, "hidden dark:block")}
            draggable={false}
          />
        </>
      )}
    </span>
  )
}
