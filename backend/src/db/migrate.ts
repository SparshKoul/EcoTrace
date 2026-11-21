import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  console.log("Running PostgreSQL schema migrations...");
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
