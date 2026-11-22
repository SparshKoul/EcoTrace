import type { FastifyPluginAsync } from "fastify";
import { query } from "../db/pool.js";
import { memory as phase3Memory } from "../services/phase3Store.js";

export const siteRoutes: FastifyPluginAsync = async (app) => {
  // GET /sites - Query active waste hotspots for the frontend map
  app.get("/sites", async (request, reply) => {
    const { status, minLat, maxLat, minLon, maxLon } = request.query as {
      status?: string;
      minLat?: string;
      maxLat?: string;
      minLon?: string;
      maxLon?: string;
    };

    let sql = `
      SELECT s.id, s.status, s.waste_type, s.latitude, s.longitude, s.ward_name, s.mla_constituency, s.mp_constituency, s.backers_count,
             COALESCE(s.severity, s.severity_score, 0) AS severity,
             COALESCE(
               (SELECT COALESCE(r.sanitized_photo_url, r.photo_url)
                FROM reports r
                WHERE r.site_id = s.id AND (r.photo_url NOT LIKE '%example.com%' OR r.sanitized_photo_url IS NOT NULL)
                ORDER BY r.created_at DESC LIMIT 1),
               CASE WHEN s.after_photo_url LIKE '%example.com%' THEN NULL ELSE s.after_photo_url END,
               CASE WHEN s.cover_media_url LIKE '%example.com%' THEN NULL ELSE s.cover_media_url END
             ) AS after_photo_url,
             s.first_reported_at, s.last_activity_at
      FROM sites s
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (minLat && maxLat && minLon && maxLon) {
      params.push(Number(minLat), Number(maxLat), Number(minLon), Number(maxLon));
      sql += ` AND latitude >= $${params.length - 3} AND latitude <= $${params.length - 2} AND longitude >= $${params.length - 1} AND longitude <= $${params.length}`;
    }

    sql += ` ORDER BY last_activity_at DESC LIMIT 100`;

    try {
      const result = await query(sql, params);
      return reply.send({ count: result.rows.length, sites: result.rows });
    } catch (err: unknown) {
      request.log.warn(err, "Database offline, returning in-memory sites");
      const inMemory = phase3Memory.listAllSites().map((s) => ({
        id: s.id,
        status: s.status,
        waste_type: s.wasteType,
        latitude: s.latitude,
        longitude: s.longitude,
        ward_name: s.wardName,
        mla_constituency: s.mla,
        mp_constituency: s.mp,
        backers_count: s.backersCount,
        severity: s.severity,
        after_photo_url: s.afterPhotoUrl ?? null,
        first_reported_at: s.firstReportedAt,
        last_activity_at: s.lastActivityAt,
      }));
      return reply.send({ count: inMemory.length, sites: inMemory });
    }
  });

  // GET /sites/:id - Fetch single site details
  app.get("/sites/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const siteResult = await query(`SELECT * FROM sites WHERE id = $1`, [id]);
      if (siteResult.rows.length === 0) {
        return reply.status(404).send({ error: "Site not found" });
      }

      const reportsResult = await query(`SELECT * FROM reports WHERE site_id = $1 ORDER BY created_at DESC`, [id]);
      return reply.send({ site: siteResult.rows[0], reports: reportsResult.rows });
    } catch (err: unknown) {
      request.log.error(err, "Failed to fetch site");
      return reply.status(500).send({ error: "Database error" });
    }
  });
};
