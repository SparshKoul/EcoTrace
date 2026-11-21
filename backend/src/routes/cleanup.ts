/** Phase 3.1 / 3.5 routes: after-photo claims and validation. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  listCleanupClaims,
  startCleanup,
  validateCleanup,
} from "../services/sites/CleanupService.js";

const startSchema = z.object({
  afterPhotoUrl: z.string().min(1, "afterPhotoUrl is required"),
  userId: z.string().min(1, "userId is required"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
});

const validateSchema = z.object({
  decision: z.enum(["accepted", "rejected"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

export const cleanupRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/sites/:id/cleanup — citizen or authority claims the site is cleared.
  app.post("/sites/:id/cleanup", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }

    const result = await startCleanup({
      siteId: id,
      afterPhotoUrl: parsed.data.afterPhotoUrl,
      uploaderId: parsed.data.userId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracyM: parsed.data.accuracyM,
    });
    if (!result.ok) {
      return reply.status(result.statusCode).send({ error: result.reason });
    }
    return reply.status(202).send({
      cleanup_id: result.claim.id,
      site_id: result.site.id,
      status: result.claim.status,
      site_status: result.site.status,
      distance_m: result.claim.distance_m,
    });
  });

  // GET /api/sites/:id/cleanup — claim history for a site.
  app.get("/sites/:id/cleanup", async (request, reply) => {
    const { id } = request.params as { id: string };
    const claims = await listCleanupClaims(id);
    return reply.send({ count: claims.length, claims });
  });

  // POST /api/cleanup/:id/validate — worker endpoint; omit `decision` to run the AI check.
  app.post("/cleanup/:id/validate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = validateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    const result = await validateCleanup(id, parsed.data);
    if (!result) return reply.status(404).send({ error: "Cleanup claim not found" });
    return reply.send({
      cleanup_id: result.claim.id,
      status: result.claim.status,
      ai_confidence: result.claim.ai_confidence,
      reason: result.claim.reason,
      site: {
        id: result.site.id,
        status: result.site.status,
        cleanup_status: result.site.cleanupStatus,
      },
    });
  });
};
