/** Phase 3.4 routes — 10 distinct backers verify a site and escalate it. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { backSite, getBackerState } from "../services/sites/BackerService.js";

const backerSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

export const backerRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/sites/:id/backers
  app.post("/sites/:id/backers", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = backerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    const result = await backSite(id, parsed.data.userId);
    if (!result) return reply.status(404).send({ error: "Site not found" });
    return reply.send({
      count: result.count,
      needed: result.needed,
      verified: result.verified,
      escalated: result.escalated,
      severity: result.site.severity,
      site_status: result.site.status,
      newly_added: result.newlyAdded,
      just_verified: result.justVerified,
    });
  });

  // GET /api/sites/:id/backers
  app.get("/sites/:id/backers", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = await getBackerState(id);
    if (!state) return reply.status(404).send({ error: "Site not found" });
    return reply.send(state);
  });
};
