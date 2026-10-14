import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Creates a player account on behalf of an admin. The service_role key lives only here
// (injected by Supabase), never in the website.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validBirthDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is calling? Resolve the caller from their own token, then check admin with the service client.
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: "You need to be logged in." });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
  if (profile?.is_admin !== true) return reply(403, { error: "Only admins can register players." });

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "Invalid request." });
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const birthDate = input.birthDate;
  const role = input.role;

  if (role !== "admin" && role !== "teacher" && role !== "user") return reply(400, { error: "Choose an account type." });
  if (name.length < 2 || name.length > 60) return reply(400, { error: "Name must have 2 to 60 characters." });
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(400, { error: "That doesn't look like a valid email address." });
  if (!validBirthDate(birthDate)) return reply(400, { error: "Birth date is not valid." });
  if (password.length < 6) return reply(400, { error: "Password must have at least 6 characters." });
  if (new TextEncoder().encode(password).length > 72) return reply(400, { error: "Password is too long (72 bytes at most)." });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (createError || !created.user) {
    const message = (createError?.message ?? "").toLowerCase();
    if (createError?.code === "email_exists" || message.includes("already")) {
      return reply(409, { error: "An account with this email already exists." });
    }
    console.error("createUser failed", createError?.message);
    return reply(400, { error: createError?.message ?? "Couldn't create the account." });
  }

  // The signup trigger made the profile as a plain player; set the chosen type (admin and teacher both have full control).
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role, is_admin: role !== "user" })
    .eq("id", created.user.id);
  const { error: privateError } = roleError
    ? { error: roleError }
    : await admin
        .from("member_private")
        .insert({ user_id: created.user.id, birth_date: birthDate, email, created_by: userData.user.id });
  if (privateError) {
    // Don't leave a half-registered account behind.
    await admin.auth.admin.deleteUser(created.user.id);
    console.error("saving the player's details failed", privateError.message);
    return reply(500, { error: "Couldn't save the player's details. Nothing was created." });
  }

  return reply(200, { id: created.user.id, name, email, role });
});
