import { FunctionsHttpError } from "@supabase/supabase-js"
import { getSupabase, isSupabaseConfigured } from "@/services/supabase/client"
import type { MemberFormValues } from "@/modules/admin/memberForm"
import { isAccountRole, type AccountRole } from "@/modules/admin/accountRole"

export interface Member {
  id: string
  name: string
  email: string
  role: AccountRole
  birthDate: string
  createdAt: string
}

export type CreateMemberResult = { error: string | null }

const NOT_CONFIGURED = "Supabase isn't set up: the keys are missing from .env.local."

async function readFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (body.error) return body.error
    } catch {
      // fall through to the generic text
    }
  }
  return "Couldn't register the player. Check your connection and try again."
}

export const memberService = {
  /** Registration goes through the `create-member` Edge Function: only it holds the key that can create accounts. */
  async create(values: MemberFormValues): Promise<CreateMemberResult> {
    if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED }
    try {
      const { error } = await getSupabase().functions.invoke("create-member", {
        body: {
          role: values.role,
          name: values.name.trim(),
          birthDate: values.birthDate,
          email: values.email.trim(),
          password: values.password,
        },
      })
      return { error: error ? await readFunctionError(error) : null }
    } catch (error) {
      return { error: await readFunctionError(error) }
    }
  },

  /** Players an admin registered. `member_private` is admin-only by row level security. */
  async list(): Promise<{ members: Member[]; error: string | null }> {
    if (!isSupabaseConfigured()) return { members: [], error: NOT_CONFIGURED }
    try {
      const supabase = getSupabase()
      const { data: rows, error } = await supabase
        .from("member_private")
        .select("user_id, birth_date, email, created_at")
        .order("created_at", { ascending: false })
      if (error) return { members: [], error: "Couldn't load the registered players." }
      if (!rows?.length) return { members: [], error: null }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, role")
        .in("id", rows.map((row) => row.user_id))
      const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]))
      const roles = new Map((profiles ?? []).map((p) => [p.id as string, p.role]))

      return {
        members: rows.map((row) => ({
          id: row.user_id as string,
          name: names.get(row.user_id as string) ?? (row.email as string),
          email: row.email as string,
          role: isAccountRole(roles.get(row.user_id as string)) ? (roles.get(row.user_id as string) as AccountRole) : "user",
          birthDate: row.birth_date as string,
          createdAt: row.created_at as string,
        })),
        error: null,
      }
    } catch {
      return { members: [], error: "Couldn't load the registered players." }
    }
  },
}
