/**
 * Phase "AI transparency pipeline": POST /api/v1/reports
 * raw private storage -> Gemini/OpenCV microservice -> PostGIS dedup -> public sanitized report.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";

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
    const part = await request.file();
    if (!part) return reply.status(400).send({ error: "IMAGE_REQUIRED" });

    const fields = part.fields as Record<string, unknown>;
    const lat = Number(valueOf(fields.lat));
    const lng = Number(valueOf(fields.lng));
    const accuracyM = Number(valueOf(fields.accuracy_m) ?? 0);
    const capturedAt = valueOf(fields.captured_at) ?? new Date().toISOString();
    const mode = valueOf(fields.mode) ?? "dump";
    const note = valueOf(fields.note) ?? "";

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return reply.status(400).send({ error: "INVALID_COORDINATES" });
    }

    const reportId = randomUUID();
    await fs.mkdir(PRIVATE_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
    const rawPath = path.join(PRIVATE_DIR, `${reportId}.jpg`);
    const buffer = await part.toBuffer();
    await fs.writeFile(rawPath, buffer);

    const clientIp = request.ip;
    const ipMasked = maskIp(clientIp);
    const ipHash = hashIp(clientIp);

    let analysis: AnalysisResponse;
    try {
      const form = new FormData();
      form.append("report_id", reportId);
      form.append("file", new Blob([buffer], { type: part.mimetype || "image/jpeg" }), `${reportId}.jpg`);
      const response = await fetch(`${env.AI_SERVICE_URL.replace(/\/$/, "")}/internal/analyze`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`AI service returned ${response.status}`);
      analysis = await response.json() as AnalysisResponse;
    } catch (cause) {
      await fs.unlink(rawPath).catch(() => undefined);
      request.log.error(cause, "AI analysis failed");
      return reply.status(503).send({ error: "AI_SERVICE_UNAVAILABLE" });
    }

    if (!analysis.is_valid_trash) {
      await fs.unlink(rawPath).catch(() => undefined);
      return reply.status(422).send({
        error: "INVALID_TRASH",
        rejection_reason: analysis.rejection_reason ?? "The image was not accepted as outdoor waste.",
      });
    }

    const category = analysis.trash_category ?? "mixed_municipal";
    const severity = analysis.severity_score ?? 3;

    // 20 m deduplication. PostGIS when available, haversine fallback otherwise.
    let siteId: string;
    let grouped = false;
    try {
      const result = await query<{ id: string }>(
        `SELECT id::text AS id FROM sites
         WHERE status IN ('open','verified','cleaning')
           AND trash_category = $3
           AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 20)
         ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)
         LIMIT 1`,
        [lat, lng, category],
      );
      const existing = result.rows[0];
      if (existing) {
        siteId = existing.id;
        grouped = true;
        await query(
          `UPDATE sites SET backers_count = backers_count + 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [siteId],
        );
      } else {
        const created = await query<{ id: string }>(
          `INSERT INTO sites (status, waste_type, latitude, longitude, trash_category, severity_score, backers_count)
           VALUES ('open', $1, $2, $3, $4, $5, 1) RETURNING id::text AS id`,
          [category, lat, lng, category, severity],
        );
        siteId = created.rows[0]!.id;
      }
    } catch {
      const result = await query<{ id: string }>(
        `SELECT id::text AS id FROM sites
         WHERE status IN ('open','verified','cleaning') AND trash_category = $3
           AND (6371000 * acos(least(1, greatest(-1,
             sin(radians($1)) * sin(radians(latitude)) +
             cos(radians($1)) * cos(radians(latitude)) * cos(radians($2) - radians(longitude)))))) <= 20
         LIMIT 1`,
        [lat, lng, category],
      );
      const existing = result.rows[0];
      if (existing) {
        siteId = existing.id;
        grouped = true;
        await query(
          `UPDATE sites SET backers_count = backers_count + 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [siteId],
        );
      } else {
        const created = await query<{ id: string }>(
          `INSERT INTO sites (status, waste_type, latitude, longitude, trash_category, severity_score, backers_count)
           VALUES ('open', $1, $2, $3, $4, $5, 1) RETURNING id::text AS id`,
          [category, lat, lng, category, severity],
        );
        siteId = created.rows[0]!.id;
      }
    }

    await query(
      `INSERT INTO reports (
         id, site_id, photo_url, waste_type, latitude, longitude, status, created_at,
         ip_masked, ip_hash, captured_at, sanitized_photo_url, is_valid_trash,
         trash_category, detected_items, severity_score, public_audit_summary, pii_blur_count
       ) VALUES ($1,$2,$3,$4,$5,$6,'verified',CURRENT_TIMESTAMP,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,$15)`,
      [
        reportId, siteId, `/private/${reportId}.jpg`, category, lat, lng,
        ipMasked, ipHash, capturedAt, analysis.sanitized_url ?? null, category,
        JSON.stringify(analysis.detected_items ?? []), severity,
        analysis.public_audit_summary ?? "", analysis.pii_blur_count ?? 0,
      ],
    );

    return reply.status(202).send({
      report_id: reportId,
      status: "VERIFIED",
      site_id: siteId,
      grouped,
      sanitized_url: analysis.sanitized_url,
      pii_blur_count: analysis.pii_blur_count ?? 0,
      trash_category: category,
      severity_score: severity,
      public_audit_summary: analysis.public_audit_summary ?? "",
      ip_masked: ipMasked,
      captured_at: capturedAt,
      mode,
      note,
      accuracy_m: accuracyM,
    });
  });
};
