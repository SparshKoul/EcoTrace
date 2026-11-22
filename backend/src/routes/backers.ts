/** Phase 3.4 routes — 10 distinct backers verify a site and escalate it. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { backSite, getBackerState } from "../services/sites/BackerService.js";
import { authErrorStatusCode, requireUser } from "../services/auth/requestUser.js";

export const backerRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/sites/:id/backers — the backer is always the authenticated session user.
  app.post("/sites/:id/backers", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const user = await requireUser(request);
      const result = await backSite(id, user.id);
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
    } catch (cause) {
      return reply.status(authErrorStatusCode(cause)).send({
        error: cause instanceof Error ? cause.message : "Authentication required",
      });
    }
  });

  // GET /api/sites/:id/backers
  app.get("/sites/:id/backers", async (request, reply) => {
    const { id } = request.params as { id: string };
    const state = await getBackerState(id);
    if (!state) return reply.status(404).send({ error: "Site not found" });
    return reply.send(state);
  });
};
