import { create } from "zustand"
import type { AccountRole } from "@/modules/admin/accountRole"

/**
 * - loading: session + data still being fetched (pages render a loader)
 * - authenticated: signed in and the player's data is hydrated into the stores
 * - unauthenticated: no session
 * - error: signed in, but the database couldn't be reached — blocked on purpose
 *   so an empty local cache can't overwrite real progress
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error"

interface AuthState {
  status: AuthStatus
  userId: string | null
  email: string | null
  displayName: string | null
  /** Full control: true for both admins and teachers. What the pages and the database policies check. */
  isAdmin: boolean
  role: AccountRole
}

interface AuthActions {
  setLoading: () => void
  setAuthenticated: (user: {
    userId: string
    email: string
    displayName: string
    isAdmin: boolean
    role: AccountRole
  }) => void
  setUnauthenticated: () => void
  setError: () => void
}

const SIGNED_OUT: AuthState = {
  status: "unauthenticated",
  userId: null,
  email: null,
  displayName: null,
  isAdmin: false,
  role: "user",
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  ...SIGNED_OUT,
  status: "loading",

  setLoading: () => set({ ...SIGNED_OUT, status: "loading" }),
  setAuthenticated: (user) => set({ status: "authenticated", ...user }),
  setUnauthenticated: () => set(SIGNED_OUT),
  setError: () => set({ ...SIGNED_OUT, status: "error" }),
}))
