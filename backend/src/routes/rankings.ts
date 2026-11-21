/** Phase 5.2 — worst-first city leaderboard. */

import type { FastifyPluginAsync } from "fastify";
import { getCityRanking } from "../services/scores/AreaScoringService.js";

export const rankingRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/rankings/city/:cityId
  app.get("/rankings/city/:cityId", async (request, reply) => {
    const { cityId } = request.params as { cityId: string };
    const rankings = await getCityRanking(decodeURIComponent(cityId));
    return reply.send({ city: cityId, count: rankings.length, rankings });
  });
};
