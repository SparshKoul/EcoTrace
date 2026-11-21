/** Phase 4.5 — photo abuse flagging. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { flagPhoto, getPhotoFlagState } from "../services/flags/PhotoFlagService.js";

const flagSchema = z.object({
  reporterId: z.string().min(1),
  reason: z.string().max(100).optional(),
});

export const flagRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/photos/:id/flag
  app.post("/photos/:id/flag", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = flagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    const result = await flagPhoto(id, parsed.data.reporterId, parsed.data.reason);
    if (!result) return reply.status(404).send({ error: "Photo not found" });
    return reply.send(result);
  });

  // GET /api/photos/:id/flag — moderation state for a photo
  app.get("/photos/:id/flag", async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getPhotoFlagState(id));
  });
};
