import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../db/pool.js";
import { aiVerifyClient } from "../services/ai/verifyClient.js";
import { findNearbySite, type Site } from "../services/sites/siteMerger.js";
import { resolveBoundary } from "../services/location/boundaryResolver.js";
import { phase4Memory } from "../services/phase4Store.js";
import { memory as phase3Memory } from "../services/phase3Store.js";
import { getRequestUser } from "../services/auth/requestUser.js";

const createReportSchema = z.object({
  photoUrl: z.string().url("Valid photo URL is required"),
  wasteType: z.string().min(1, "wasteType must be specified"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  userId: z.string().optional(),
});

export const reportRoutes: FastifyPluginAsync = async (app) => {
  // POST /reports - Citizen submits a waste report
  app.post("/reports", async (request, reply) => {
    const parseResult = createReportSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parseResult.error.format(),
      });
    }

    const { photoUrl, wasteType, latitude, longitude } = parseResult.data;
    // A valid Supabase token always wins over the optional demo userId field.
    const authUser = await getRequestUser(request);
    const userId = authUser?.id ?? parseResult.data.userId;

    // 1. Resolve administrative boundaries (Ward, MLA, MP)
    const boundary = resolveBoundary({ latitude, longitude });

    // 2. Verify photo through AI service
    const aiResult = await aiVerifyClient.verifyPhoto(photoUrl);

    try {
      // 3. Check for 20m spatial clustering against existing open sites
      const sitesQuery = await query(`
        SELECT id, latitude, longitude, backers_count as "reportCount", status 
        FROM sites 
        WHERE status = 'open'
      `);

      const existingSites: Site[] = sitesQuery.rows.map((row) => ({
        id: row.id,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        reportIds: [],
        reportCount: Number(row.reportCount),
        status: row.status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const nearbySite = findNearbySite(latitude, longitude, existingSites, 20);
      let siteId: string;
      let isClustered = false;

      if (nearbySite) {
        // Group with existing site (Same-spot merge within 20m)
        siteId = nearbySite.id;
        isClustered = true;

        await query(
          `UPDATE sites 
           SET backers_count = backers_count + 1, 
               last_activity_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [siteId],
        );
      } else {
        // Create brand new site hotspot
        const newSiteResult = await query(
          `INSERT INTO sites (waste_type, latitude, longitude, ward_name, mla_constituency, mp_constituency, backers_count, status)
           VALUES ($1, $2, $3, $4, $5, $6, 1, 'open')
           RETURNING id`,
          [
            wasteType,
            latitude,
            longitude,
            boundary.ward.name,
            boundary.mla.constituencyName,
            boundary.mp.constituencyName,
          ],
        );
        siteId = newSiteResult.rows[0].id;
      }

      // 4. Insert report linked to site
      const insertReportQuery = `
        INSERT INTO reports (site_id, photo_url, waste_type, latitude, longitude, ai_verified, ai_confidence, status, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, site_id, photo_url, waste_type, latitude, longitude, ai_verified, ai_confidence, status, user_id, created_at
      `;

      const reportResult = await query(insertReportQuery, [
        siteId,
        photoUrl,
        wasteType,
        latitude,
        longitude,
        aiResult.is_waste,
        aiResult.confidence,
        aiResult.is_waste ? "verified" : "needs_review",
        userId ?? null,
      ]);

      const createdReport = reportResult.rows[0];
      phase4Memory.saveReport({
        id: String(createdReport.id),
        site_id: String(createdReport.site_id),
        user_id: userId,
        photo_url: photoUrl,
        waste_type: wasteType,
        latitude,
        longitude,
        status: String(createdReport.status),
        created_at: new Date(String(createdReport.created_at)).toISOString(),
      });
      return reply.status(201).send({
        success: true,
        report: createdReport,
        siteId,
        clustered: isClustered,
        boundary,
        aiVerification: aiResult,
      });
    } catch (err: unknown) {
      request.log.error(err, "Database error during report ingestion");
      // Fallback response for offline mock mode
      const fallbackId = "mock-" + Date.now();
      const fallbackStatus = aiResult.is_waste ? "verified" : "needs_review";
      const fallbackSiteId = "site-" + Date.now().toString(36);
      phase3Memory.saveSite({
        id: fallbackSiteId,
        status: "open",
        cleanupStatus: "none",
        verification: "unverified",
        severity: 75,
        latitude,
        longitude,
        wasteType,
        wardName: boundary.ward.name,
        mla: boundary.mla.constituencyName,
        mp: boundary.mp.constituencyName,
        backersCount: 1,
        afterPhotoUrl: photoUrl,
        firstReportedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
      phase4Memory.saveReport({
        id: fallbackId,
        site_id: fallbackSiteId,
        user_id: userId,
        photo_url: photoUrl,
        waste_type: wasteType,
        latitude,
        longitude,
        status: fallbackStatus,
        created_at: new Date().toISOString(),
      });
      return reply.status(201).send({
        success: true,
        report: {
          id: fallbackId,
          photoUrl,
          wasteType,
          latitude,
          longitude,
          status: fallbackStatus,
          user_id: userId ?? null,
          created_at: new Date().toISOString(),
        },
        siteId: fallbackSiteId,
        clustered: false,
        boundary,
        aiVerification: aiResult,
        warning: "Database offline",
      });
    }
  });

  // GET /reports - List recent reports
  app.get("/reports", async (request, reply) => {
    try {
      const result = await query(`
        SELECT id, site_id, photo_url, waste_type, latitude, longitude, status, created_at 
        FROM reports 
        ORDER BY created_at DESC 
        LIMIT 50
      `);
      return reply.send({ count: result.rows.length, reports: result.rows });
    } catch (err: unknown) {
      request.log.warn(err, "Database offline, returning empty reports array");
      return reply.send({ count: 0, reports: [] });
    }
  });
};
