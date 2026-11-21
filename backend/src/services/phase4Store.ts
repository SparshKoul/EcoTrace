/** In-memory fallback for Phase 4 when PostgreSQL is offline. */

import type { CitizenNote } from "../domain/notes/NoteSummary.js";
import type { VoteRecord } from "../domain/sites/VoteTally.js";
import type { PhotoFlagRecord } from "../domain/flags/PhotoFlags.js";

export interface StoredReport {
  readonly id: string;
  readonly site_id: string | null;
  readonly user_id?: string;
  readonly photo_url: string;
  readonly waste_type: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: string;
  readonly created_at: string;
}

export interface StoredVote extends VoteRecord {
  readonly id?: string;
  readonly site_id: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface StoredFlag extends PhotoFlagRecord {}

const reports = new Map<string, StoredReport>();
const notes = new Map<string, CitizenNote>();
const votes = new Map<string, StoredVote>();
const flags = new Map<string, StoredFlag>();
export interface CachedSummary {
  readonly summary: string;
  readonly source: string;
  readonly note_count: number;
  readonly created_at: string;
}

const summaries = new Map<string, CachedSummary>();

const DEMO_SITE = "site_demo_chitkara";
const now = new Date().toISOString();

function seed(): void {
  if (reports.size > 0) return;
  const demoReports: StoredReport[] = [
    {
      id: "rpt_demo_1", site_id: DEMO_SITE, user_id: "demo-user",
      photo_url: "https://example.com/report-1.jpg", waste_type: "mixed",
      latitude: 30.5157, longitude: 76.6592, status: "verified", created_at: now,
    },
    {
      id: "rpt_demo_2", site_id: DEMO_SITE, user_id: "demo-user",
      photo_url: "https://example.com/report-2.jpg", waste_type: "plastic",
      latitude: 30.5161, longitude: 76.6601, status: "received", created_at: now,
    },
  ];
  demoReports.forEach((report) => reports.set(report.id, report));

  const demoNotes: CitizenNote[] = [
    { id: "nte_demo_1", siteId: DEMO_SITE, userId: "u1", content: "Cleared every Friday by the municipal truck.", createdAt: now },
    { id: "nte_demo_2", siteId: DEMO_SITE, userId: "u2", content: "Strong smell in the evening near the main road.", createdAt: now },
    { id: "nte_demo_3", siteId: DEMO_SITE, userId: "u3", content: "No dustbin within walking distance for residents.", createdAt: now },
  ];
  demoNotes.forEach((note) => notes.set(note.id, note));
}

seed();

export const phase4Memory = {
  saveReport(report: StoredReport): void {
    reports.set(report.id, report);
  },
  getReport(id: string): StoredReport | undefined {
    return reports.get(id);
  },
  listReportsByUser(userId: string): StoredReport[] {
    return [...reports.values()].filter((report) => report.user_id === userId);
  },
  listReportsBySite(siteId: string): StoredReport[] {
    return [...reports.values()].filter((report) => report.site_id === siteId);
  },
  addNote(note: CitizenNote): void {
    notes.set(note.id, note);
  },
  listNotes(siteId: string): CitizenNote[] {
    return [...notes.values()].filter((note) => note.siteId === siteId);
  },
  upsertVote(vote: StoredVote): void {
    for (const [key, existing] of votes) {
      if (existing.site_id === vote.site_id && existing.userId === vote.userId) votes.delete(key);
    }
    votes.set(`${vote.site_id}:${vote.userId}`, vote);
  },
  listVotes(siteId: string): StoredVote[] {
    return [...votes.values()].filter((vote) => vote.site_id === siteId);
  },
  listVotesByUser(userId: string): StoredVote[] {
    return [...votes.values()].filter((vote) => vote.userId === userId);
  },
  listNotesByUser(userId: string): CitizenNote[] {
    return [...notes.values()].filter((note) => note.userId === userId);
  },
  addFlag(flag: StoredFlag): void {
    flags.set(`${flag.photoId}:${flag.reporterId}`, flag);
  },
  listFlags(photoId: string): StoredFlag[] {
    return [...flags.values()].filter((flag) => flag.photoId === photoId);
  },
  getSummary(siteId: string): CachedSummary | undefined {
    return summaries.get(siteId);
  },
  setSummary(siteId: string, value: CachedSummary): void {
    summaries.set(siteId, value);
  },
  listAllNotes(): CitizenNote[] {
    return [...notes.values()];
  },
};

export const PHASE4_DEMO_SITE = DEMO_SITE;
