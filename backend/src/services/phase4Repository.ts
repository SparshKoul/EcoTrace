/** Phase 4 persistence: PostgreSQL when reachable, in-memory fallback otherwise. */

import { query } from "../db/pool.js";
import { tallyFlags } from "../domain/flags/PhotoFlags.js";
import type { CitizenNote } from "../domain/notes/NoteSummary.js";
import type { VoteKind } from "../domain/sites/VoteTally.js";
import { memory as phase3Memory } from "./phase3Store.js";
import {
  phase4Memory,
  type CachedSummary,
  type StoredFlag,
  type StoredReport,
  type StoredVote,
} from "./phase4Store.js";

type Row = Record<string, unknown>;

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

function mapReport(row: Row): StoredReport {
  return {
    id: String(row.id),
    site_id: row.site_id === null || row.site_id === undefined ? null : String(row.site_id),
    user_id: row.user_id === null || row.user_id === undefined ? undefined : String(row.user_id),
    photo_url: String(row.photo_url),
    waste_type: String(row.waste_type),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    status: String(row.status),
    created_at: iso(row.created_at ?? Date.now()),
  };
}

function mapNote(row: Row): CitizenNote {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    userId: row.user_id === null || row.user_id === undefined ? undefined : String(row.user_id),
    content: String(row.content),
    createdAt: iso(row.created_at ?? Date.now()),
  };
}

function mapVote(row: Row): StoredVote {
  return {
    id: String(row.id),
    site_id: String(row.site_id),
    userId: String(row.user_id),
    vote: String(row.vote) as VoteKind,
    latitude: row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude),
    createdAt: iso(row.created_at ?? Date.now()),
  };
}

function mapFlag(row: Row): StoredFlag {
  return {
    photoId: String(row.photo_id),
    reporterId: String(row.reporter_id),
    reason: row.reason === null || row.reason === undefined ? undefined : String(row.reason),
    createdAt: iso(row.created_at ?? Date.now()),
  };
}

export async function listReportsByUser(userId: string): Promise<StoredReport[]> {
  try {
    const result = await query(
      `SELECT id, site_id, user_id, photo_url, waste_type, latitude, longitude, status, created_at
       FROM reports WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    if (result.rows.length > 0) return result.rows.map((row) => mapReport(row as Row));
  } catch {
    // offline
  }
  return phase4Memory.listReportsByUser(userId);
}

export async function getReport(id: string): Promise<StoredReport | null> {
  try {
    const result = await query(
      `SELECT id, site_id, user_id, photo_url, waste_type, latitude, longitude, status, created_at
       FROM reports WHERE id = $1`,
      [id],
    );
    if (result.rows[0]) return mapReport(result.rows[0] as Row);
  } catch {
    // offline
  }
  return phase4Memory.getReport(id) ?? null;
}

export async function addNote(siteId: string, userId: string, content: string): Promise<CitizenNote> {
  const note: CitizenNote = {
    id: `nte_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    siteId,
    userId,
    content,
    createdAt: new Date().toISOString(),
  };
  phase4Memory.addNote(note);
  try {
    await query(
      `INSERT INTO notes (site_id, user_id, content, created_at) VALUES ($1,$2,$3,$4)`,
      [siteId, userId, content, note.createdAt],
    );
  } catch {
    // offline
  }
  return note;
}

export async function listNotes(siteId: string): Promise<CitizenNote[]> {
  try {
    const result = await query(
      `SELECT id, site_id, user_id, content, created_at FROM notes
       WHERE site_id = $1 ORDER BY created_at ASC`,
      [siteId],
    );
    if (result.rows.length > 0) return result.rows.map((row) => mapNote(row as Row));
  } catch {
    // offline
  }
  return phase4Memory.listNotes(siteId);
}

export async function upsertVote(input: {
  siteId: string;
  userId: string;
  vote: VoteKind;
  latitude?: number;
  longitude?: number;
}): Promise<StoredVote> {
  const record: StoredVote = {
    id: `vot_${Date.now().toString(36)}`,
    site_id: input.siteId,
    userId: input.userId,
    vote: input.vote,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: new Date().toISOString(),
  };
  phase4Memory.upsertVote(record);
  try {
    await query(
      `INSERT INTO site_votes (site_id, user_id, vote, latitude, longitude, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (site_id, user_id) DO UPDATE
       SET vote = EXCLUDED.vote, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           created_at = EXCLUDED.created_at`,
      [input.siteId, input.userId, input.vote, input.latitude ?? null, input.longitude ?? null, record.createdAt],
    );
  } catch {
    // offline
  }
  return record;
}

export async function listVotes(siteId: string): Promise<StoredVote[]> {
  try {
    const result = await query(
      `SELECT id, site_id, user_id, vote, latitude, longitude, created_at
       FROM site_votes WHERE site_id = $1`,
      [siteId],
    );
    if (result.rows.length > 0) return result.rows.map((row) => mapVote(row as Row));
  } catch {
    // offline
  }
  return phase4Memory.listVotes(siteId);
}

export async function addFlag(
  photoId: string,
  reporterId: string,
  reason?: string,
): Promise<StoredFlag> {
  const flag: StoredFlag = {
    photoId,
    reporterId,
    reason,
    createdAt: new Date().toISOString(),
  };
  phase4Memory.addFlag(flag);
  try {
    await query(
      `INSERT INTO photo_flags (photo_id, reporter_id, reason, created_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (photo_id, reporter_id) DO NOTHING`,
      [photoId, reporterId, reason ?? null, flag.createdAt],
    );
  } catch {
    // offline
  }
  return flag;
}

export async function listFlags(photoId: string): Promise<StoredFlag[]> {
  try {
    const result = await query(
      `SELECT photo_id, reporter_id, reason, created_at FROM photo_flags WHERE photo_id = $1`,
      [photoId],
    );
    if (result.rows.length > 0) return result.rows.map((row) => mapFlag(row as Row));
  } catch {
    // offline
  }
  return phase4Memory.listFlags(photoId);
}

export function getSummaryCache(siteId: string) {
  return phase4Memory.getSummary(siteId);
}

export function setSummaryCache(siteId: string, value: CachedSummary) {
  phase4Memory.setSummary(siteId, value);
}

export interface ActivityEntry {
  readonly kind: "report" | "vote" | "note" | "cleanup";
  readonly id: string;
  readonly siteId: string | null;
  readonly detail: string;
  readonly createdAt: string;
  photoUrl?: string;
  photoHidden?: boolean;
}

export async function getActivity(userId: string): Promise<ActivityEntry[]> {
  const [reports, votes, notes, claims] = await Promise.all([
    listReportsByUser(userId),
    Promise.resolve(phase4Memory.listVotesByUser(userId)),
    Promise.resolve(phase4Memory.listNotesByUser(userId)),
    Promise.resolve(phase3Memory.listAllClaims().filter((claim) => claim.uploader_id === userId)),
  ]);

  const entries: ActivityEntry[] = reports.map((report) => ({
    kind: "report",
    id: report.id,
    siteId: report.site_id,
    detail: `Waste report (${report.waste_type}) · ${report.status}`,
    createdAt: report.created_at,
    photoUrl: report.photo_url,
  }));
  votes.forEach((vote) => entries.push({
    kind: "vote", id: vote.id || `${vote.site_id}:${vote.userId}`, siteId: vote.site_id,
    detail: `Voted ${vote.vote}`, createdAt: vote.createdAt,
  }));
  notes.forEach((note) => entries.push({
    kind: "note", id: note.id, siteId: note.siteId,
    detail: "Added a community note", createdAt: note.createdAt,
  }));
  claims.forEach((claim) => entries.push({
    kind: "cleanup", id: claim.id, siteId: claim.site_id,
    detail: `Cleanup claim ${claim.status}`, createdAt: claim.created_at,
    photoUrl: claim.after_photo_url,
  }));

  // 4.5: mask report photos with 3+ abuse flags pending moderation.
  // Flags are keyed by report id (the photo's owner record), not by the storage URL.
  for (const entry of entries) {
    if (entry.kind !== "report" || !entry.photoUrl) continue;
    const flagState = tallyFlags(await listFlags(entry.id));
    if (flagState.hidden) {
      entry.photoUrl = undefined;
      entry.photoHidden = true;
    }
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
