import { env } from "./config/env.js";
import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { checkDbHealth } from "./db/pool.js";
import { reportRoutes } from "./routes/reports.js";
import { siteRoutes } from "./routes/sites.js";
import { cleanupRoutes } from "./routes/cleanup.js";
import { backerRoutes } from "./routes/backers.js";
import { letterRoutes } from "./routes/letters.js";
import { voteRoutes } from "./routes/votes.js";
import { noteRoutes } from "./routes/notes.js";
import { flagRoutes } from "./routes/flags.js";
import { activityRoutes } from "./routes/activity.js";
import { areaRoutes } from "./routes/areas.js";
import { rankingRoutes } from "./routes/rankings.js";
import { scanRoutes } from "./routes/scans.js";
import { shareRoutes } from "./routes/share.js";
import { authRoutes } from "./routes/auth.js";

export function buildServer(): FastifyInstance {
  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  // Enable CORS to accept requests from any client (desktop, mobile LAN, tunnels)
  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id", "Accept", "*"],
    credentials: true,
  });

  // Health check endpoint (including DB connectivity probe)
  app.get("/health", async () => {
    const dbStatus = await checkDbHealth();
    return {
      status: "ok",
      service: "ecotrace-backend",
      environment: env.NODE_ENV,
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Register feature routes
  app.register(reportRoutes, { prefix: "/api" });
  app.register(siteRoutes, { prefix: "/api" });

  // Phase 3 — Civic Action & Cleanup Verification
  app.register(cleanupRoutes, { prefix: "/api" });
  app.register(backerRoutes, { prefix: "/api" });
  app.register(letterRoutes, { prefix: "/api" });

  // Phase 4 — Community Engagement & Citizen Verification
  app.register(voteRoutes, { prefix: "/api" });
  app.register(noteRoutes, { prefix: "/api" });
  app.register(flagRoutes, { prefix: "/api" });
  app.register(activityRoutes, { prefix: "/api" });

  // Phase 5 — Cleanliness Scores & Video Scanning
  app.register(areaRoutes, { prefix: "/api" });
  app.register(rankingRoutes, { prefix: "/api" });
  app.register(scanRoutes, { prefix: "/api" });
  app.register(shareRoutes, { prefix: "/api" });

  // Supabase Authentication
  app.register(authRoutes, { prefix: "/api" });

  return app;
}

async function start() {
  const app = buildServer();
  const port = env.PORT;
  const host = env.HOST;

  try {
    await app.listen({ port, host });
    app.log.info(`EcoTrace backend server listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start();
}
