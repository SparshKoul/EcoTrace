/** Phase 4.4 — "My Activity": reports, votes, notes and cleanup claims by user. */

import type { FastifyPluginAsync } from "fastify";
import { tallyFlags } from "../domain/flags/PhotoFlags.js";
import { getActivity, listFlags, listReportsByUser } from "../services/phase4Repository.js";
import { authErrorStatusCode, requireUser } from "../services/auth/requestUser.js";

export const activityRoutes: FastifyPluginAsync = async (app) => {
  // /api/users/me/* — identity always comes from the Supabase session token.
  app.get("/users/me/reports", async (request, reply) => {
    try {
      const user = await requireUser(request);
      const reports = await listReportsByUser(user.id);
      const masked = await Promise.all(reports.map(async (report) => {
        const pendingModeration = tallyFlags(await listFlags(report.id)).hidden;
        return {
          ...report,
          photo_url: pendingModeration ? null : report.photo_url,
          pending_moderation: pendingModeration,
        };
      }));
      return reply.send({ count: masked.length, reports: masked });
    } catch (cause) {
      return reply.status(authErrorStatusCode(cause)).send({
        error: cause instanceof Error ? cause.message : "Authentication required",
      });
    }
  });

  app.get("/users/me/activity", async (request, reply) => {
    try {
      const user = await requireUser(request);
      const activity = await getActivity(user.id);
      return reply.send({ count: activity.length, activity });
    } catch (cause) {
      return reply.status(authErrorStatusCode(cause)).send({
        error: cause instanceof Error ? cause.message : "Authentication required",
      });
    }
  });
};
