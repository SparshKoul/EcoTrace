import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { isSupabaseConnection, pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  // Log only the host, never credentials.
  let target = "configured database";
  try {
    target = new URL(env.DATABASE_URL).host;
  } catch {
    // leave the generic label
  }
  console.log(`Running EcoTrace schema migration against ${target}${isSupabaseConnection() ? " (Supabase detected)" : ""}...`);

  try {
    await pool.query(sql);
    console.log("✅ PostgreSQL schema migrations applied successfully.");
  } catch (err) {
    console.error("❌ Failed to apply PostgreSQL migrations:", err);
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => pool.end())
    .catch(() => process.exit(1));
}
