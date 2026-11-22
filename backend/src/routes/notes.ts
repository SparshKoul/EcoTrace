/** Phase 4.2 / 4.3 — community notes and their AI/offline briefing. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { addNote, listNotes } from "../services/phase4Repository.js";
import { summarizeNotes } from "../services/notes/NoteSummarizer.js";
import { getSite } from "../services/sites/phase3Repository.js";
import { authErrorStatusCode, requireUser } from "../services/auth/requestUser.js";

const noteSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const noteRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/sites/:id/notes — the author is always the authenticated session user.
  app.post("/sites/:id/notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = noteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    try {
      const user = await requireUser(request);
      const note = await addNote(id, user.id, parsed.data.content);
      return reply.status(201).send(note);
    } catch (cause) {
      return reply.status(authErrorStatusCode(cause)).send({
        error: cause instanceof Error ? cause.message : "Authentication required",
      });
    }
  });

  // GET /api/sites/:id/notes
  app.get("/sites/:id/notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const notes = await listNotes(id);
    return reply.send({ count: notes.length, notes });
  });

  // GET /api/sites/:id/notes/summary
  app.get("/sites/:id/notes/summary", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await getSite(id))) return reply.status(404).send({ error: "Site not found" });
    const summary = await summarizeNotes(id);
    return reply.send(summary);
  });
};
