/** Verifies database connectivity and lists the EcoTrace tables without printing credentials. */

import { env } from "../config/env.js";
import { checkDbHealth, isSupabaseConnection, pool, query } from "./pool.js";

async function main(): Promise<void> {
  let host = "configured database";
  try {
    host = new URL(env.DATABASE_URL).host;
  } catch {
    // leave the generic label
  }

  console.log(`Checking ${host}${isSupabaseConnection() ? " (Supabase)" : ""}...`);
  const health = await checkDbHealth();
  if (!health.connected) {
    console.error(`❌ Connection failed: ${health.error}`);
    await pool.end();
    process.exit(1);
  }
  console.log(`✅ Connected in ${health.latencyMs} ms`);

  const result = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const tables = result.rows.map((row) => row.table_name);
  console.log(`Tables in public schema (${tables.length}): ${tables.join(", ") || "none"}`);

  const required = ["users", "sites", "reports", "notes", "area_scores", "cleanup_claims", "site_backers", "letters", "site_votes", "photo_flags", "scan_sessions", "scan_frames"];
  const missing = required.filter((table) => !tables.includes(table));
  if (missing.length > 0) {
    console.error(`❌ Missing tables: ${missing.join(", ")}. Run npm run db:migrate.`);
    await pool.end();
    process.exit(1);
  }
  console.log("✅ All EcoTrace tables are present.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("❌ Database check failed:", error);
  await pool.end();
  process.exit(1);
});
