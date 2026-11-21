/** Supabase Auth service — accounts live in the Supabase project, never in this codebase. */

import { query } from "../../db/pool.js";
import { getSupabaseAdmin, getSupabaseAnon } from "../../db/supabase.js";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName?: string;
}

export interface AuthResult extends AuthUser {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
}

export class AuthError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "AuthError";
  }
}

function toResult(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }, session: {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}): AuthResult {
  const fullName = user.user_metadata?.full_name;
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: typeof fullName === "string" ? fullName : undefined,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
  };
}

/** Keeps the public user profile in sync with Supabase Auth. Non-fatal if the DB is offline. */
async function ensureProfile(id: string, email: string, fullName?: string): Promise<void> {
  try {
    await query(
      `INSERT INTO public.users (id, email, full_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = CURRENT_TIMESTAMP`,
      [id, email, fullName ?? null],
    );
  } catch {
    // Profile sync is best-effort; auth still works.
  }
}

async function readProfile(id: string): Promise<{ email: string; fullName?: string } | null> {
  try {
    const result = await query<{ email: string; full_name: string | null }>(
      `SELECT email, full_name FROM public.users WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (row) return { email: String(row.email), fullName: row.full_name ?? undefined };
  } catch {
    // fall back to the Auth user record
  }
  return null;
}

/** Creates a confirmed Supabase user, then signs in to obtain a session token. */
export async function signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? "" },
    // Only accounts created through EcoTrace may sign in.
    app_metadata: { ecotrace_account: true },
  });
  if (error || !data.user) throw new AuthError(error?.message ?? "Could not create account.");
  await ensureProfile(data.user.id, data.user.email ?? email, fullName);

  const client = getSupabaseAnon() ?? admin;
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new AuthError(signIn.error?.message ?? "Account created, but sign-in failed.");
  }
  return toResult(signIn.data.user, signIn.data.session);
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseAnon() ?? getSupabaseAdmin();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new AuthError(error?.message ?? "Invalid email or password.", 401);
  }
  // Reject pre-existing Supabase users that were never registered by this app.
  await getUserFromToken(data.session.access_token);

  const metadataName = data.user.user_metadata?.full_name;
  await ensureProfile(
    data.user.id,
    data.user.email ?? email,
    typeof metadataName === "string" ? metadataName : undefined,
  );
  return toResult(data.user, data.session);
}

export async function getUserFromToken(token: string): Promise<AuthUser> {
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new AuthError("Session is invalid or expired.", 401);
  if (data.user.app_metadata?.ecotrace_account !== true) {
    throw new AuthError("This account was not created in EcoTrace. Please sign up first.", 403);
  }
  const metadataName = data.user.user_metadata?.full_name;
  const profile = await readProfile(data.user.id);
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    fullName: profile?.fullName ?? (typeof metadataName === "string" ? metadataName : undefined),
  };
}

export async function signOut(token: string): Promise<void> {
  const { error } = await getSupabaseAdmin().auth.admin.signOut(token);
  if (error) throw new AuthError(error.message);
}
