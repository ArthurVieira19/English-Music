"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { WifiOff } from "lucide-react"
import { isPublicPath } from "@/lib/authPaths"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { BrandLogo } from "@/components/brand-logo"

/**
 * The middleware already bounces visitors without a session; this covers the
 * client side of it: nothing private renders until the player's data has
 * finished loading, and a dead session falls back to the login page.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const status = useAuthStore((s) => s.status)
  const isPublic = isPublicPath(pathname)

  useEffect(() => {
    if (status === "unauthenticated" && !isPublic) router.replace("/login")
  }, [status, isPublic, router])

  if (isPublic || status === "authenticated") return <>{children}</>

  if (status === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <WifiOff aria-hidden className="size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Couldn&apos;t load your account</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          We couldn&apos;t reach the server, so your progress wasn&apos;t loaded. It&apos;s safe — nothing was
          changed. Check your connection and try again.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div role="status" aria-label="Loading" className="flex flex-1 items-center justify-center py-24">
      <BrandLogo className="h-20 opacity-90 motion-safe:animate-pulse" />
    </div>
  )
}
