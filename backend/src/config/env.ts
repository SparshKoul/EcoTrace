import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.string().transform(Number).default(8000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL must be provided for PostgreSQL"),
  /** Set to "true"/"false" to override SSL auto-detection (Supabase requires SSL). */
  DB_SSL: z.enum(["true", "false"]).optional(),
  AI_SERVICE_URL: z.string().url().default("http://localhost:5000"),
  CORS_ORIGIN: z.string().default("*"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Supabase project credentials. Optional so local/offline development still works.
  // The service role key must stay server-side — never expose it to the frontend.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_RAW_BUCKET: z.string().default("ecotrace-raw-private"),
  SUPABASE_PUBLIC_BUCKET: z.string().default("ecotrace-sanitized-public"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  throw new Error("Invalid environment configuration. Check your .env file.");
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
