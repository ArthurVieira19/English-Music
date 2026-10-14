import { isAccountRole, type AccountRole } from "./accountRole"

export interface MemberFormValues {
  role: AccountRole
  name: string
  birthDate: string
  email: string
  password: string
}

export type MemberFormErrors = Partial<Record<keyof MemberFormValues, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6

/** Today as YYYY-MM-DD in the player's own timezone (what a date input uses). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Same rules as the `create-member` Edge Function, so mistakes show up before the round trip. */
export function validateMemberForm(values: MemberFormValues, today: string = todayIso()): MemberFormErrors {
  const errors: MemberFormErrors = {}
  if (!isAccountRole(values.role)) errors.role = "Choose an account type."
  const name = values.name.trim()
  if (name.length < 2) errors.name = "Enter the player's name."
  else if (name.length > 60) errors.name = "Name is too long (60 characters at most)."

  if (!isRealDate(values.birthDate)) errors.birthDate = "Enter a valid birth date."
  else if (values.birthDate < "1900-01-01" || values.birthDate > today) errors.birthDate = "Birth date is out of range."

  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "That doesn't look like a valid email address."

  if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  return errors
}
