/** In-memory fallback for Phase 5 scan sessions when PostgreSQL is offline. */

import type { ScanFrameInput } from "../domain/scans/ScanSession.js";

export interface StoredScanSession {
  readonly id: string;
  readonly user_id?: string;
  readonly status: "active" | "completed";
  readonly started_at: string;
  readonly ended_at?: string;
}

export interface StoredScanFrame extends ScanFrameInput {
  readonly id: string;
  readonly session_id: string;
}

const sessions = new Map<string, StoredScanSession>();
const frames = new Map<string, StoredScanFrame>();

export const phase5Memory = {
  saveSession(session: StoredScanSession): void {
    sessions.set(session.id, session);
  },
  getSession(id: string): StoredScanSession | undefined {
    return sessions.get(id);
  },
  saveFrame(frame: StoredScanFrame): void {
    frames.set(frame.id, frame);
  },
  listFrames(sessionId: string): StoredScanFrame[] {
    return [...frames.values()]
      .filter((frame) => frame.session_id === sessionId)
      .sort((a, b) => a.t_ms - b.t_ms);
  },
};
