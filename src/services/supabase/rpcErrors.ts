interface PostgrestLikeError {
  code?: string
  message?: string
}

/**
 * Whether an RPC failed only because its SQL migration hasn't been run on this
 * Supabase project. PostgREST answers PGRST202 for a function it can't find;
 * 42883 is Postgres' own "function does not exist".
 */
export function isMissingFunction(error: PostgrestLikeError): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    Boolean(error.message?.includes("Could not find the function"))
  )
}
