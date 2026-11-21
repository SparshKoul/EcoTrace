/**
 * Supabase clients. The service-role key bypasses Row Level Security, so this module
 * must only ever be imported by backend code — never by the frontend bundle.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use Supabase services.");
  }
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** Null when no anon key is configured; useful for public-bucket URL signing. */
export function getSupabaseAnon(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  if (!anonClient) {
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

export const STORAGE_BUCKETS = {
  /** Raw, unblurred evidence. Keep private. */
  raw: env.SUPABASE_RAW_BUCKET,
  /** Sanitized, PII-blurred evidence served publicly. */
  public: env.SUPABASE_PUBLIC_BUCKET,
} as const;
