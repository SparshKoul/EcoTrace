/** Phase 5.1 — area cleanliness scorecards. */

import type { FastifyPluginAsync } from "fastify";
import type { AreaKind } from "../domain/scores/AreaScores.js";
import { getAreaScore, listAreaScores } from "../services/scores/AreaScoringService.js";

const KINDS: readonly string[] = ["ward", "mla", "mp"];

export const areaRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/areas/:kind
  app.get("/areas/:kind", async (request, reply) => {
    const { kind } = request.params as { kind: string };
    if (!KINDS.includes(kind)) return reply.status(400).send({ error: "invalid_area_kind" });
    const areas = await listAreaScores(kind as AreaKind);
    return reply.send({ kind, count: areas.length, areas });
  });

  // GET /api/areas/:kind/:id/score
  app.get("/areas/:kind/:id/score", async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    if (!KINDS.includes(kind)) return reply.status(400).send({ error: "invalid_area_kind" });
    const score = await getAreaScore(kind as AreaKind, decodeURIComponent(id));
    if (!score) return reply.status(404).send({ error: "Area not found" });
    return reply.send(score);
  });
};
