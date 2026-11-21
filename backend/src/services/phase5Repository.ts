/** Phase 5 persistence and aggregation: PostgreSQL when reachable, in-memory fallback otherwise. */

import { query } from "../db/pool.js";
import type { AreaKind } from "../domain/scores/AreaScores.js";
import type { ScanFrameInput } from "../domain/scans/ScanSession.js";
import { memory as phase3Memory } from "./phase3Store.js";
import {
  phase5Memory,
  type StoredScanFrame,
  type StoredScanSession,
} from "./phase5Store.js";

type Row = Record<string, unknown>;

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

export interface AreaAggregate {
  readonly id: string;
  readonly name: string;
  readonly kind: AreaKind;
  readonly reporterCount: number;
  readonly cleanedCount: number;
  readonly openCount: number;
  readonly reopenedCount: number;
  readonly avgCleanupHours: number | null;
}

const AREA_COLUMN: Record<AreaKind, string> = {
  ward: "ward_name",
  mla: "mla_constituency",
  mp: "mp_constituency",
};

export async function listAreaAggregates(kind: AreaKind): Promise<AreaAggregate[]> {
  const column = AREA_COLUMN[kind];
  try {
    const result = await query(`
      SELECT ${column} AS name,
             SUM(backers_count) AS reporters,
             SUM(CASE WHEN status = 'cleaned' THEN 1 ELSE 0 END) AS cleaned,
             SUM(CASE WHEN status IN ('open','verified','cleaning') THEN 1 ELSE 0 END) AS open_count,
             SUM(CASE WHEN status = 'reopened' THEN 1 ELSE 0 END) AS reopened,
             AVG(EXTRACT(EPOCH FROM (last_activity_at - first_reported_at)) / 3600)
               FILTER (WHERE status = 'cleaned') AS avg_hours
      FROM sites
      WHERE ${column} IS NOT NULL
      GROUP BY ${column}
    `);
    if (result.rows.length > 0) {
      return result.rows.map((row) => ({
        id: String(row.name),
        name: String(row.name),
        kind,
        reporterCount: Number(row.reporters ?? 0),
        cleanedCount: Number(row.cleaned ?? 0),
        openCount: Number(row.open_count ?? 0),
        reopenedCount: Number(row.reopened ?? 0),
        avgCleanupHours: row.avg_hours == null ? null : Number(row.avg_hours),
      }));
    }
  } catch {
    // offline
  }

  const grouped = new Map<string, AreaAggregate>();
  for (const site of phase3Memory.listAllSites()) {
    const name = kind === "ward" ? site.wardName : kind === "mla" ? site.mla : site.mp;
    if (!name) continue;
    const current = grouped.get(name) ?? {
      id: name, name, kind, reporterCount: 0, cleanedCount: 0, openCount: 0,
      reopenedCount: 0, avgCleanupHours: null,
    };
    const hours = (Date.parse(site.lastActivityAt) - Date.parse(site.firstReportedAt)) / 3_600_000;
    grouped.set(name, {
      ...current,
      reporterCount: current.reporterCount + site.backersCount,
      cleanedCount: current.cleanedCount + (site.status === "cleaned" ? 1 : 0),
      openCount: current.openCount + (["open", "verified", "cleaning"].includes(site.status) ? 1 : 0),
      reopenedCount: current.reopenedCount + (site.status === "reopened" ? 1 : 0),
      avgCleanupHours: site.status === "cleaned"
        ? Math.round(((current.avgCleanupHours ?? 0) + Math.max(0, hours)) / 2)
        : current.avgCleanupHours,
    });
  }
  return [...grouped.values()];
}

export async function startScan(userId?: string): Promise<StoredScanSession> {
  const session: StoredScanSession = {
    id: `scn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    status: "active",
    started_at: new Date().toISOString(),
  };
  phase5Memory.saveSession(session);
  try {
    await query(
      `INSERT INTO scan_sessions (id, user_id, status, started_at) VALUES ($1,$2,$3,$4)`,
      [session.id, userId ?? null, "active", session.started_at],
    );
  } catch {
    // offline
  }
  return session;
}

export async function getScan(id: string): Promise<{ session: StoredScanSession; frames: StoredScanFrame[] } | null> {
  let session = phase5Memory.getSession(id);
  try {
    const result = await query(`SELECT id, user_id, status, started_at, ended_at FROM scan_sessions WHERE id = $1`, [id]);
    if (result.rows[0]) {
      const row = result.rows[0] as Row;
      session = {
        id: String(row.id),
        user_id: row.user_id == null ? undefined : String(row.user_id),
        status: String(row.status) as StoredScanSession["status"],
        started_at: iso(row.started_at),
        ended_at: row.ended_at ? iso(row.ended_at) : undefined,
      };
    }
  } catch {
    // offline
  }
  if (!session) return null;

  let frames = phase5Memory.listFrames(id);
  try {
    const frameResult = await query(
      `SELECT id, session_id, t_ms, photo_url, latitude, longitude, accuracy_m, created_at
       FROM scan_frames WHERE session_id = $1 ORDER BY t_ms ASC`,
      [id],
    );
    if (frameResult.rows.length > 0) {
      frames = frameResult.rows.map((row) => ({
        id: String(row.id),
        session_id: String(row.session_id),
        t_ms: Number(row.t_ms),
        photoUrl: String(row.photo_url),
        latitude: row.latitude == null ? undefined : Number(row.latitude),
        longitude: row.longitude == null ? undefined : Number(row.longitude),
        accuracyM: row.accuracy_m == null ? undefined : Number(row.accuracy_m),
      }));
    }
  } catch {
    // offline
  }
  return { session, frames };
}

export async function saveFrame(frame: StoredScanFrame): Promise<void> {
  phase5Memory.saveFrame(frame);
  try {
    await query(
      `INSERT INTO scan_frames (id, session_id, t_ms, photo_url, latitude, longitude, accuracy_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [frame.id, frame.session_id, frame.t_ms, frame.photoUrl,
        frame.latitude ?? null, frame.longitude ?? null, frame.accuracyM ?? null],
    );
  } catch {
    // offline
  }
}

export async function completeScan(id: string): Promise<StoredScanSession | null> {
  const existing = await getScan(id);
  if (!existing) return null;
  const completed: StoredScanSession = {
    ...existing.session,
    status: "completed",
    ended_at: new Date().toISOString(),
  };
  phase5Memory.saveSession(completed);
  try {
    await query(`UPDATE scan_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
  } catch {
    // offline
  }
  return completed;
}
