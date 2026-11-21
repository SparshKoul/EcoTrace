/** Phase 5.4 — social share links and before/after SVG cards. */

import type { FastifyPluginAsync } from "fastify";
import { buildShareCard } from "../services/share/ShareCardService.js";

export const shareRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/share/sites/:id
  app.get("/share/sites/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await buildShareCard(id);
    if (!result) return reply.status(404).send({ error: "Site not found" });
    return reply.send(result);
  });

  // GET /api/share/sites/:id/card.svg
  app.get("/share/sites/:id/card.svg", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await buildShareCard(id);
    if (!result) return reply.status(404).send({ error: "Site not found" });
    return reply.type("image/svg+xml").send(result.svg);
  });
};
