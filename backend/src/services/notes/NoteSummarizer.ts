/** Phase 4.3 — AI notes summarizer with a deterministic offline briefing. */

import { env } from "../../config/env.js";
import { buildOfflineSummary } from "../../domain/notes/NoteSummary.js";
import { getSummaryCache, listNotes, setSummaryCache } from "../phase4Repository.js";

export interface NoteSummaryResult {
  readonly summary: string;
  readonly source: "ai" | "offline";
  readonly note_count: number;
  readonly created_at: string;
}

export async function summarizeNotes(siteId: string): Promise<NoteSummaryResult | null> {
  const cached = getSummaryCache(siteId);
  if (cached) return { ...cached } as NoteSummaryResult;

  const notes = await listNotes(siteId);
  if (notes.length === 0) {
    return {
      summary: "No citizen observations have been recorded yet.",
      source: "offline",
      note_count: 0,
      created_at: new Date().toISOString(),
    };
  }

  let summary = buildOfflineSummary(notes);
  let source: "ai" | "offline" = "offline";

  try {
    const response = await fetch(`${env.AI_SERVICE_URL.replace(/\/$/, "")}/internal/summarize-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, notes: notes.map((note) => note.content) }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = (await response.json()) as { summary?: string };
      if (typeof data.summary === "string" && data.summary.trim()) {
        summary = data.summary;
        source = "ai";
      }
    }
  } catch {
    // offline — use the deterministic briefing built from citizen text only
  }

  const value = { summary, source, note_count: notes.length, created_at: new Date().toISOString() };
  setSummaryCache(siteId, value);
  return { ...value };
}
