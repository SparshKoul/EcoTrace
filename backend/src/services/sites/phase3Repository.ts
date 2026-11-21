/** Phase 3 persistence: PostgreSQL when reachable, in-memory fallback otherwise. */

import { query } from "../../db/pool.js";
import {
  memory,
  type BackerRecord,
  type CleanupClaimRecord,
  type StoredSite,
} from "../phase3Store.js";

type Row = Record<string, unknown>;

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

function mapSite(row: Row): StoredSite {
  return {
    id: String(row.id),
    status: String(row.status),
    cleanupStatus: String(row.cleanup_status ?? "none"),
    verification: String(row.verification ?? "unverified"),
    severity: Number(row.severity ?? 0),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    wasteType: String(row.waste_type ?? "mixed"),
    wardName: row.ward_name === null || row.ward_name === undefined ? undefined : String(row.ward_name),
    mla: row.mla_constituency === null || row.mla_constituency === undefined ? undefined : String(row.mla_constituency),
    mp: row.mp_constituency === null || row.mp_constituency === undefined ? undefined : String(row.mp_constituency),
    backersCount: Number(row.backers_count ?? 0),
    afterPhotoUrl: row.after_photo_url === null || row.after_photo_url === undefined ? null : String(row.after_photo_url),
    firstReportedAt: iso(row.first_reported_at ?? Date.now()),
    lastActivityAt: iso(row.last_activity_at ?? Date.now()),
  };
}

function mapClaim(row: Row): CleanupClaimRecord {
  return {
    id: String(row.id),
    site_id: String(row.site_id),
    after_photo_url: String(row.after_photo_url),
    uploader_id: String(row.uploader_id),
    latitude: row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude),
    distance_m: row.distance_m === null || row.distance_m === undefined ? undefined : Number(row.distance_m),
    status: String(row.status) as CleanupClaimRecord["status"],
    ai_confidence: row.ai_confidence === null || row.ai_confidence === undefined ? undefined : Number(row.ai_confidence),
    reason: row.reason === null || row.reason === undefined ? undefined : String(row.reason),
    created_at: iso(row.created_at ?? Date.now()),
    validated_at: row.validated_at ? iso(row.validated_at) : undefined,
  };
}

export async function getSite(id: string): Promise<StoredSite | null> {
  try {
    const result = await query(
      `SELECT id, status, cleanup_status, verification, severity, latitude, longitude,
              waste_type, ward_name, mla_constituency, mp_constituency, backers_count,
              after_photo_url, first_reported_at, last_activity_at
       FROM sites WHERE id = $1`,
      [id],
    );
    if (result.rows[0]) return mapSite(result.rows[0] as Row);
  } catch {
    // DB offline — fall through to the in-memory store.
  }
  return memory.getSite(id) ?? null;
}

export async function saveSite(site: StoredSite): Promise<StoredSite> {
  memory.saveSite(site);
  try {
    await query(
      `UPDATE sites SET status = $1, cleanup_status = $2, verification = $3, severity = $4,
              backers_count = $5, after_photo_url = $6, last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [site.status, site.cleanupStatus, site.verification, site.severity, site.backersCount, site.afterPhotoUrl ?? null, site.id],
    );
  } catch {
    // Offline: in-memory copy already saved.
  }
  return site;
}

export async function addBacker(siteId: string, userId: string): Promise<boolean> {
  const addedInMemory = memory.addBacker({
    site_id: siteId,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  try {
    const result = await query(
      `INSERT INTO site_backers (site_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [siteId, userId],
    );
    return (result.rowCount ?? 0) > 0 || addedInMemory;
  } catch {
    return addedInMemory;
  }
}

export async function listBackers(siteId: string): Promise<BackerRecord[]> {
  try {
    const result = await query(
      `SELECT site_id, user_id, created_at FROM site_backers WHERE site_id = $1`,
      [siteId],
    );
    if (result.rows.length > 0) {
      return result.rows.map((row) => ({
        site_id: String(row.site_id),
        user_id: String(row.user_id),
        created_at: iso(row.created_at),
      }));
    }
  } catch {
    // fall through
  }
  return memory.listBackers(siteId);
}

export async function saveClaim(claim: CleanupClaimRecord): Promise<CleanupClaimRecord> {
  memory.saveClaim(claim);
  try {
    await query(
      `INSERT INTO cleanup_claims
         (id, site_id, after_photo_url, uploader_id, latitude, longitude, distance_m, status, ai_confidence, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [claim.id, claim.site_id, claim.after_photo_url, claim.uploader_id, claim.latitude ?? null,
        claim.longitude ?? null, claim.distance_m ?? null, claim.status, claim.ai_confidence ?? null,
        claim.reason ?? null, claim.created_at],
    );
  } catch {
    // offline
  }
  return claim;
}

export async function getClaim(id: string): Promise<CleanupClaimRecord | null> {
  try {
    const result = await query(`SELECT * FROM cleanup_claims WHERE id = $1`, [id]);
    if (result.rows[0]) return mapClaim(result.rows[0] as Row);
  } catch {
    // offline
  }
  return memory.getClaim(id) ?? null;
}

export async function listClaims(siteId: string): Promise<CleanupClaimRecord[]> {
  try {
    const result = await query(
      `SELECT * FROM cleanup_claims WHERE site_id = $1 ORDER BY created_at DESC`,
      [siteId],
    );
    if (result.rows.length > 0) return result.rows.map((row) => mapClaim(row as Row));
  } catch {
    // offline
  }
  return memory.listClaims(siteId);
}

export async function updateClaim(claim: CleanupClaimRecord): Promise<CleanupClaimRecord> {
  memory.saveClaim(claim);
  try {
    await query(
      `UPDATE cleanup_claims SET status = $1, ai_confidence = $2, reason = $3, validated_at = $4 WHERE id = $5`,
      [claim.status, claim.ai_confidence ?? null, claim.reason ?? null, claim.validated_at ?? null, claim.id],
    );
  } catch {
    // offline
  }
  return claim;
}

export async function saveLetter(letter: {
  id: string;
  site_id: string;
  document: unknown;
  created_at: string;
}): Promise<void> {
  memory.saveLetter(letter);
  try {
    await query(
      `INSERT INTO letters (id, site_id, document, created_at) VALUES ($1,$2,$3::jsonb,$4)`,
      [letter.id, letter.site_id, JSON.stringify(letter.document), letter.created_at],
    );
  } catch {
    // offline
  }
}

export async function getLetterBySite(siteId: string): Promise<unknown | null> {
  try {
    const result = await query(
      `SELECT document FROM letters WHERE site_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [siteId],
    );
    if (result.rows[0]) return result.rows[0].document;
  } catch {
    // offline
  }
  return memory.getLetterBySite(siteId)?.document ?? null;
}
