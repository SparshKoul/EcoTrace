/** Phase 4.4 — "My Activity": reports, votes, notes and cleanup claims by user. */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { tallyFlags } from "../domain/flags/PhotoFlags.js";
import { getActivity, listFlags, listReportsByUser } from "../services/phase4Repository.js";

function resolveUserId(request: FastifyRequest): string | null {
  const header = request.headers["x-user-id"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromQuery = (request.query as { userId?: string }).userId;
  return fromHeader || fromQuery || null;
}

export const activityRoutes: FastifyPluginAsync = async (app) => {
  const register = (path: string) => {
    app.get(`${path}/reports`, async (request, reply) => {
      const userId = resolveUserId(request);
      if (!userId) return reply.status(400).send({ error: "USER_ID_REQUIRED" });
      const reports = await listReportsByUser(userId);
      const masked = await Promise.all(reports.map(async (report) => {
        const pendingModeration = tallyFlags(await listFlags(report.id)).hidden;
        return {
          ...report,
          photo_url: pendingModeration ? null : report.photo_url,
          pending_moderation: pendingModeration,
        };
      }));
      return reply.send({ count: masked.length, reports: masked });
    });

    app.get(`${path}/activity`, async (request, reply) => {
      const userId = resolveUserId(request);
      if (!userId) return reply.status(400).send({ error: "USER_ID_REQUIRED" });
      const activity = await getActivity(userId);
      return reply.send({ count: activity.length, activity });
    });
  };

  register("/users/me");
  register("/users/:userId");
};
