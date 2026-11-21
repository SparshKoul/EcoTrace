/** Phase 3.2 / 3.3 route — verified, deterministic complaint letter draft. */

import type { FastifyPluginAsync } from "fastify";
import { getOrCreateLetter } from "../services/letters/LetterService.js";

export const letterRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/letters/site/:id
  app.get("/letters/site/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const letter = await getOrCreateLetter(id);
    if (!letter) return reply.status(404).send({ error: "Site not found" });
    return reply.send(letter);
  });
};
