/** Phase 4.1 — community voting and backing. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { castVote, getVoteState } from "../services/sites/VoteService.js";

const voteSchema = z.object({
  userId: z.string().min(1),
  vote: z.enum(["confirm", "reject", "cleaned"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const voteRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/sites/:id/vote
  app.post("/sites/:id/vote", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = voteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    const result = await castVote({ siteId: id, ...parsed.data });
    if (!result) return reply.status(404).send({ error: "Site not found" });
    if (!result.withinRadius) {
      return reply.status(400).send({ error: "vote_too_far", distance_m: result.distanceM });
    }
    return reply.send({
      site_id: result.siteId,
      tally: result.tally,
      distance_m: result.distanceM,
      backers: result.backers
        ? { count: result.backers.count, needed: result.backers.needed, verified: result.backers.verified }
        : null,
      site_rejected: result.siteRejected,
    });
  });

  // GET /api/sites/:id/votes
  app.get("/sites/:id/votes", async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getVoteState(id));
  });
};
