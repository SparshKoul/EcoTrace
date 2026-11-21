import "dotenv/config";
import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

export function buildServer(): FastifyInstance {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV !== "production"
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

  // Enable CORS for frontend integration
  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Health check endpoint
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "ecotrace-backend",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  return app;
}

async function start() {
  const app = buildServer();
  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || "0.0.0.0";

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
