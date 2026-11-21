import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

/** True when the configured Postgres host is a Supabase database. */
export function isSupabaseConnection(): boolean {
  try {
    return new URL(env.DATABASE_URL).hostname.includes("supabase");
  } catch {
    return false;
  }
}

function sslSetting(): false | { rejectUnauthorized: boolean } {
  if (env.DB_SSL === "false") return false;
  if (env.DB_SSL === "true") return { rejectUnauthorized: false };
  const requiresSsl =
    isSupabaseConnection() ||
    env.DATABASE_URL.includes("sslmode=require") ||
    env.NODE_ENV === "production";
  return requiresSsl ? { rejectUnauthorized: false } : false;
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: sslSetting(),
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function checkDbHealth(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { connected: false, error: message };
  }
}
