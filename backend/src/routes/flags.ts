/** Phase 4.5 — photo abuse flagging. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { flagPhoto, getPhotoFlagState } from "../services/flags/PhotoFlagService.js";
import { authErrorStatusCode, requireUser } from "../services/auth/requestUser.js";

const flagSchema = z.object({
  reason: z.string().max(100).optional(),
});

export const flagRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/photos/:id/flag — the reporter is always the authenticated session user.
  app.post("/photos/:id/flag", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = flagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    try {
      const user = await requireUser(request);
      const result = await flagPhoto(id, user.id, parsed.data.reason);
      if (!result) return reply.status(404).send({ error: "Photo not found" });
      return reply.send(result);
    } catch (cause) {
      return reply.status(authErrorStatusCode(cause)).send({
        error: cause instanceof Error ? cause.message : "Authentication required",
      });
    }
  });

  // GET /api/photos/:id/flag — moderation state for a photo
  app.get("/photos/:id/flag", async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getPhotoFlagState(id));
  });
};
