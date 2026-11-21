import { env } from "./config/env.js";
import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { checkDbHealth } from "./db/pool.js";
import { reportRoutes } from "./routes/reports.js";
import { siteRoutes } from "./routes/sites.js";

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

  // Enable CORS
  app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
