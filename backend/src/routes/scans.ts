/** Phase 5.3 — continuous walking/driving video scan ingestion. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { addFrames, beginScan, finishScan, getScanState } from "../services/scans/ScanService.js";
import { authErrorStatusCode, requireUser } from "../services/auth/requestUser.js";

const startSchema = z.object({});

const frameSchema = z.object({
  t_ms: z.number().int().nonnegative(),
  photoUrl: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().nonnegative().optional(),
});

const framesSchema = z.object({ frames: z.array(frameSchema).min(1) });

export const scanRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/scans/start — the session owner is always the authenticated user.
  app.post("/scans/start", async (request, reply) => {
    const parsed = startSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });
    try {
      const user = await requireUser(request);
      const result = await beginScan(user.id);
      return reply.status(201).send(result);
    } catch (cause) {
      return reply.status(authErrorStatusCode(cause)).send({
        error: cause instanceof Error ? cause.message : "Authentication required",
      });
    }
  });

  // POST /api/scans/:id/frames
  app.post("/scans/:id/frames", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = framesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    const result = await addFrames(id, parsed.data.frames);
    if (!result) return reply.status(404).send({ error: "Active scan session not found" });
    return reply.send(result);
  });

  // GET /api/scans/:id
  app.get("/scans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getScanState(id);
    if (!result) return reply.status(404).send({ error: "Scan session not found" });
    return reply.send(result);
  });

  // POST /api/scans/:id/complete
  app.post("/scans/:id/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await finishScan(id);
    if (!result) return reply.status(404).send({ error: "Scan session not found" });
    return reply.send(result);
  });
};
