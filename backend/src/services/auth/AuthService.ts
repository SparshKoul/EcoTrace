/** Supabase Auth service — accounts live in the Supabase project, never in this codebase. */

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

/** Creates a confirmed Supabase user, then signs in to obtain a session token. */
export async function signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? "" },
  });
  if (error || !data.user) throw new AuthError(error?.message ?? "Could not create account.");

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
  return toResult(data.user, data.session);
}

export async function getUserFromToken(token: string): Promise<AuthUser> {
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new AuthError("Session is invalid or expired.", 401);
  const fullName = data.user.user_metadata?.full_name;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: typeof fullName === "string" ? fullName : undefined,
  };
}

export async function signOut(token: string): Promise<void> {
  const { error } = await getSupabaseAdmin().auth.admin.signOut(token);
  if (error) throw new AuthError(error.message);
}
