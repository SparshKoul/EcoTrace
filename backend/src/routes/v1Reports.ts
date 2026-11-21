/**
 * EcoTrace v1 evidence pipeline:
 * authenticated capture -> private raw storage -> Gemini/OpenCV -> PostGIS merge -> public feed.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { getRequestUser } from "../services/auth/requestUser.js";
import { resolveBoundary } from "../services/location/boundaryResolver.js";
import { draftLetter } from "../services/letters/LetterDrafter.js";

const PRIVATE_DIR = path.resolve(process.cwd(), "storage", "private");
const PUBLIC_DIR = path.resolve(process.cwd(), "storage", "public");

interface AnalysisResponse {
  readonly is_valid_trash: boolean;
  readonly rejection_reason?: string | null;
  readonly trash_category?: string;
  readonly pii_detections?: unknown[];
  readonly detected_items?: string[];
  readonly severity_score?: number;
  readonly public_audit_summary?: string;
  readonly sanitized_url?: string | null;
  readonly thumbnail_url?: string | null;
  readonly pii_blur_count?: number;
  readonly model_used?: string;
}

const valueOf = (input: unknown): string | undefined => {
  if (Array.isArray(input)) return valueOf(input[0]);
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "value" in input) {
    const value = (input as { value: unknown }).value;
    return value === undefined || value === null ? undefined : String(value);
  }
  return undefined;
};

export function maskIp(ip: string): string {
  const clean = ip.replace(/^::ffff:/, "");
  if (clean.includes(".")) {
    const parts = clean.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.***` : "masked";
  }
  const parts = clean.split(":");
  return parts.length >= 3 ? `${parts[0]}:${parts[1]}:${parts[2]}:***` : "masked";
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export const v1ReportRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/reports", async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: "AUTHENTICATION_REQUIRED" });

    const part = await request.file();
    if (!part) return reply.status(400).send({ error: "MEDIA_REQUIRED" });
    const fields = part.fields as Record<string, unknown>;
    const mediaType = valueOf(fields.media_type) === "video" ? "video" : "photo";
    const lat = Number(valueOf(fields.lat));
    const lng = Number(valueOf(fields.lng));
    const accuracy = Number(valueOf(fields.accuracy) ?? valueOf(fields.accuracy_m) ?? 0);
    const capturedAt = valueOf(fields.captured_at) ?? new Date().toISOString();
    const notes = valueOf(fields.notes) ?? valueOf(fields.note) ?? "";

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return reply.status(400).send({ error: "INVALID_COORDINATES" });
    }
    if (accuracy > 50) return reply.status(400).send({ error: "GPS_TOO_IMPRECISE", accuracy });

    const reportId = randomUUID();
    await fs.mkdir(PRIVATE_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
    const extension = mediaType === "video"
      ? (part.mimetype.includes("mp4") ? "mp4" : "webm")
      : "jpg";
    const rawPath = path.join(PRIVATE_DIR, `${reportId}.${extension}`);
    const buffer = await part.toBuffer();
    await fs.writeFile(rawPath, buffer);

    const clientIp = request.ip;
    const ipMasked = maskIp(clientIp);
    const ipHash = hashIp(clientIp);

    let analysis: AnalysisResponse;
    try {
      const form = new FormData();
      form.append("report_id", reportId);
      form.append("media_type", mediaType);
      form.append("file", new Blob([buffer], { type: part.mimetype || (mediaType === "video" ? "video/webm" : "image/jpeg") }), `${reportId}.${extension}`);
      const response = await fetch(`${env.AI_SERVICE_URL.replace(/\/$/, "")}/internal/process-media`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) throw new Error(`AI service returned ${response.status}`);
      analysis = await response.json() as AnalysisResponse;
    } catch (cause) {
      await fs.unlink(rawPath).catch(() => undefined);
      request.log.error(cause, "AI media processing failed");
      return reply.status(503).send({ error: "AI_SERVICE_UNAVAILABLE" });
    }

    if (!analysis.is_valid_trash) {
      await fs.unlink(rawPath).catch(() => undefined);
      return reply.status(422).send({
        error: "INVALID_TRASH",
        rejection_reason: analysis.rejection_reason ?? "The media was not accepted as outdoor waste.",
      });
    }

    const category = analysis.trash_category ?? "mixed_municipal";
    const severity = analysis.severity_score ?? 3;
    const sanitizedUrl = analysis.sanitized_url ?? null;
    const thumbnailUrl = analysis.thumbnail_url ?? sanitizedUrl;
    const boundary = resolveBoundary({ latitude: lat, longitude: lng });

    let siteId: string;
    let grouped = false;
    const createSite = async (): Promise<string> => {
      const created = await query<{ id: string }>(
        `INSERT INTO sites (status, waste_type, latitude, longitude, trash_category, severity_score,
                            cover_media_url, media_type, ulb_name, ward_name, mla_constituency, mp_constituency, backers_count)
         VALUES ('open', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
         RETURNING id::text AS id`,
        [category, lat, lng, category, severity, sanitizedUrl, mediaType, boundary.ward.name,
          boundary.ward.name, boundary.mla.constituencyName, boundary.mp.constituencyName],
      );
      return created.rows[0]!.id;
    };

    try {
      const existing = await query<{ id: string }>(
        `SELECT id::text AS id FROM sites
         WHERE status IN ('open','verified','cleaning') AND trash_category = $3
           AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 20)
         LIMIT 1`,
        [lat, lng, category],
      );
      if (existing.rows[0]) {
        siteId = existing.rows[0].id;
        grouped = true;
        await query(
          `UPDATE sites SET backers_count = backers_count + 1,
             severity_score = GREATEST(severity_score, $2),
             cover_media_url = COALESCE(cover_media_url, $3),
             last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [siteId, severity, sanitizedUrl],
        );
      } else siteId = await createSite();
    } catch {
      const existing = await query<{ id: string }>(
        `SELECT id::text AS id FROM sites
         WHERE status IN ('open','verified','cleaning') AND trash_category = $3
           AND (6371000 * acos(least(1, greatest(-1,
             sin(radians($1)) * sin(radians(latitude)) +
             cos(radians($1)) * cos(radians(latitude)) * cos(radians($2) - radians(longitude)))))) <= 20
         LIMIT 1`,
        [lat, lng, category],
      );
      if (existing.rows[0]) {
        siteId = existing.rows[0].id;
        grouped = true;
        await query(
          `UPDATE sites SET backers_count = backers_count + 1,
             severity_score = GREATEST(severity_score, $2), last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [siteId, severity],
        );
      } else siteId = await createSite();
    }

    await query(
      `INSERT INTO reports (
         id, user_id, site_id, photo_url, waste_type, latitude, longitude, status, created_at,
         ip_masked, ip_hash, captured_at, sanitized_photo_url, thumbnail_url, media_type,
         request_ip_masked, is_valid_trash, trash_category, detected_items, severity_score,
         public_audit_summary, pii_blur_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'verified',CURRENT_TIMESTAMP,$8,$9,$10,$11,$12,$13,$14,TRUE,$15,$16,$17,$18,$19)`,
      [
        reportId, user.id, siteId, `/private/${reportId}.${extension}`, category, lat, lng,
        ipMasked, ipHash, capturedAt, sanitizedUrl, thumbnailUrl, mediaType, ipMasked,
        category, JSON.stringify(analysis.detected_items ?? []), severity,
        analysis.public_audit_summary ?? "", analysis.pii_blur_count ?? 0,
      ],
    );

    const letter = draftLetter({
      id: siteId,
      wasteType: category,
      latitude: lat,
      longitude: lng,
      status: "open",
      severity,
      backers_count: 1,
      ward_name: boundary.ward.name,
      mla_constituency: boundary.mla.constituencyName,
      mp_constituency: boundary.mp.constituencyName,
    });

    return reply.status(201).send({
      report_id: reportId,
      site_id: siteId,
      status: "VERIFIED",
      grouped,
      media_type: mediaType,
      trash_category: category,
      severity_score: severity,
      detected_items: analysis.detected_items ?? [],
      public_audit_summary: analysis.public_audit_summary ?? "",
      sanitized_url: sanitizedUrl,
      thumbnail_url: thumbnailUrl,
      pii_blur_count: analysis.pii_blur_count ?? 0,
      pii_detections: analysis.pii_detections ?? [],
      captured_at: capturedAt,
      lat,
      lng,
      request_ip_masked: ipMasked,
      model_used: analysis.model_used,
      notes,
      letter,
    });
  });

  app.get("/v1/sites", async (_request, reply) => {
    try {
      const result = await query(
        `SELECT id::text, status, waste_type, latitude, longitude, trash_category, severity_score,
                backers_count AS report_count, cover_media_url, media_type,
                ulb_name, mla_constituency, mp_constituency, first_reported_at AS created_at,
                last_activity_at AS updated_at
         FROM sites ORDER BY last_activity_at DESC LIMIT 200`,
      );
      return reply.send({ count: result.rows.length, sites: result.rows });
    } catch {
      return reply.send({ count: 0, sites: [] });
    }
  });

  app.get("/v1/reports/feed", async (_request, reply) => {
    try {
      const result = await query(
        `SELECT r.id::text, r.site_id::text, r.media_type, r.sanitized_photo_url AS sanitized_media_url,
                COALESCE(r.thumbnail_url, r.sanitized_photo_url) AS thumbnail_url,
                r.trash_category, r.detected_items, r.severity_score AS severity,
                r.pii_blur_count, r.public_audit_summary, r.latitude AS lat, r.longitude AS lng, r.captured_at,
                r.request_ip_masked, r.status, s.status AS site_status, s.backers_count AS report_count,
                s.ulb_name, s.mla_constituency, s.mp_constituency
         FROM reports r LEFT JOIN sites s ON s.id = r.site_id
         WHERE r.status = 'verified'
         ORDER BY r.captured_at DESC NULLS LAST LIMIT 100`,
      );
      return reply.send({ count: result.rows.length, reports: result.rows });
    } catch {
      return reply.send({ count: 0, reports: [] });
    }
  });

  app.get("/v1/users/me/activity", async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: "AUTHENTICATION_REQUIRED" });
    try {
      const result = await query(
        `SELECT r.id::text, r.site_id::text, r.media_type, r.sanitized_photo_url AS sanitized_media_url,
                COALESCE(r.thumbnail_url, r.sanitized_photo_url) AS thumbnail_url,
                r.trash_category, r.severity_score AS severity, r.pii_blur_count,
                r.public_audit_summary, r.latitude AS lat, r.longitude AS lng, r.captured_at, r.request_ip_masked,
                r.status, s.status AS site_status, s.backers_count AS report_count
         FROM reports r LEFT JOIN sites s ON s.id = r.site_id
         WHERE r.user_id = $1 ORDER BY r.captured_at DESC NULLS LAST LIMIT 200`,
        [user.id],
      );
      const summary = result.rows.reduce(
        (acc, row) => ({
          total_reports: acc.total_reports + 1,
          pii_protected: acc.pii_protected + Number(row.pii_blur_count ?? 0),
          active_sites: acc.active_sites + (["open", "verified", "cleaning"].includes(String(row.site_status)) ? 1 : 0),
          cleaned_sites: acc.cleaned_sites + (String(row.site_status) === "cleaned" ? 1 : 0),
        }),
        { total_reports: 0, pii_protected: 0, active_sites: 0, cleaned_sites: 0 },
      );
      return reply.send({ user_id: user.id, summary, activity: result.rows });
    } catch {
      return reply.send({ user_id: user.id, summary: { total_reports: 0, pii_protected: 0, active_sites: 0, cleaned_sites: 0 }, activity: [] });
    }
  });
};
