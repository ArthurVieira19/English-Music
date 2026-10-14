export type AccountRole = "admin" | "teacher" | "user"

export const ACCOUNT_ROLES: { value: AccountRole; label: string; description: string }[] = [
  { value: "user", label: "Player", description: "Can only play. Can't register anyone or add and delete songs." },
  { value: "teacher", label: "Teacher", description: "Full control: registers players and manages the song library." },
  { value: "admin", label: "Admin", description: "Full control: registers players and manages the song library." },
]

export const DEFAULT_ACCOUNT_ROLE: AccountRole = "user"

export function isAccountRole(value: unknown): value is AccountRole {
  return value === "admin" || value === "teacher" || value === "user"
}

export function roleLabel(role: AccountRole): string {
  return ACCOUNT_ROLES.find((entry) => entry.value === role)?.label ?? "Player"
}

/** Admins and teachers have full control; players only play. */
export function hasFullControl(role: AccountRole): boolean {
  return role === "admin" || role === "teacher"
}
