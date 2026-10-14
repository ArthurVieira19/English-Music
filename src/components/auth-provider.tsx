"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import type { User } from "@supabase/supabase-js"
import { getSupabase, isSupabaseConfigured } from "@/services/supabase/client"
import { flushRemoteSync, syncOnSignIn } from "@/services/supabase/userDataSync"
import { songRepository } from "@/services/songs/songRepository"
import { storageService } from "@/services/storage/storageService"
import { isAccountRole, type AccountRole } from "@/modules/admin/accountRole"
import { useAuthStore } from "@/stores/authStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useStatsStore } from "@/stores/statsStore"
import { useAchievementStore } from "@/stores/achievementStore"
import { useLibraryStore } from "@/stores/libraryStore"
import { useReviewStore } from "@/stores/reviewStore"

/** Songs saved in this browser before accounts existed become part of the global library the first time an admin logs in. */
async function migrateLegacySongs(adminId: string) {
  const legacySongs = storageService.getLegacyCustomSongs()
  if (legacySongs.length === 0) return

  try {
    await songRepository.importMany(legacySongs, adminId)
    storageService.clearLegacyCustomSongs()
    toast.success(
      `Moved ${legacySongs.length} ${legacySongs.length === 1 ? "song" : "songs"} from this browser to the global library.`,
    )
  } catch (error) {
    // Left in place so the next login tries again.
    console.warn("Could not migrate local songs to the global library.", error)
  }
}

/**
 * Which kind of account this is (shown as a badge only; permissions come from is_admin).
 * Read on its own so a database without the `role` column yet can't block logging in.
 */
async function loadRole(userId: string, isAdmin: boolean): Promise<AccountRole> {
  const fallback: AccountRole = isAdmin ? "admin" : "user"
  try {
    const { data } = await getSupabase().from("profiles").select("role").eq("id", userId).maybeSingle<{ role: string }>()
    return isAccountRole(data?.role) ? data.role : fallback
  } catch {
    return fallback
  }
}

async function bootstrap(user: User) {
  const auth = useAuthStore.getState()
  auth.setLoading()

  try {
    const { data: profile, error } = await getSupabase()
      .from("profiles")
      .select("display_name, is_admin")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string; is_admin: boolean }>()
    if (error) throw error

    if (!(await syncOnSignIn(user.id))) {
      auth.setError()
      return
    }

    useSettingsStore.getState().loadFromStorage()
    useStatsStore.getState().loadFromStorage()
    useAchievementStore.getState().loadFromStorage()
    useReviewStore.getState().loadFromStorage()

    const isAdmin = profile?.is_admin === true
    const role = await loadRole(user.id, isAdmin)
    if (isAdmin) await migrateLegacySongs(user.id)
    await useLibraryStore.getState().load()

    const email = user.email ?? ""
    auth.setAuthenticated({
      userId: user.id,
      email,
      displayName: profile?.display_name ?? email.split("@")[0],
      isAdmin,
      role,
    })
  } catch (error) {
    console.warn("Could not finish signing in.", error)
    auth.setError()
  }
}

/**
 * Watches the Supabase session and, once someone is signed in, loads their
 * profile, progress and the global song library into the stores.
 */
export function AuthProvider() {
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useAuthStore.getState().setUnauthenticated()
      return
    }

    let bootstrappedFor: string | null = null

    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (!session && event === "INITIAL_SESSION")) {
        bootstrappedFor = null
        useAuthStore.getState().setUnauthenticated()
        return
      }

      if (!session || (event !== "INITIAL_SESSION" && event !== "SIGNED_IN")) return
      // Supabase re-fires SIGNED_IN when the tab regains focus; that isn't a new login.
      if (bootstrappedFor === session.user.id) return
      bootstrappedFor = session.user.id

      // Supabase calls made synchronously inside this callback can deadlock the auth client.
      setTimeout(() => void bootstrap(session.user), 0)
    })

    // Best-effort save when the tab is hidden/closed; anything that misses is
    // re-pushed from the cache on the next login (it stays marked dirty).
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") void flushRemoteSync()
    }
    const flushOnPageHide = () => void flushRemoteSync()
    document.addEventListener("visibilitychange", flushOnHide)
    window.addEventListener("pagehide", flushOnPageHide)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener("visibilitychange", flushOnHide)
      window.removeEventListener("pagehide", flushOnPageHide)
    }
  }, [])

  return null
}
