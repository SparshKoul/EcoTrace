/** Phase 5.3 — scan session orchestration with synchronised GPS frames. */

import {
  checkFrame,
  scanProgress,
  type ScanFrameInput,
} from "../../domain/scans/ScanSession.js";
import {
  completeScan,
  getScan,
  saveFrame,
  startScan,
} from "../phase5Repository.js";

export async function beginScan(userId?: string) {
  const session = await startScan(userId);
  return { session, progress: scanProgress([]) };
}

export interface FrameBatchResult {
  readonly session_id: string;
  readonly accepted: number;
  readonly rejected: readonly { readonly t_ms: number; readonly reason: string }[];
  readonly progress: ReturnType<typeof scanProgress>;
}

export async function addFrames(
  sessionId: string,
  frames: readonly ScanFrameInput[],
): Promise<FrameBatchResult | null> {
  const existing = await getScan(sessionId);
  if (!existing || existing.session.status !== "active") return null;

  const acceptedFrames = [...existing.frames];
  const rejected: { t_ms: number; reason: string }[] = [];

  for (const frame of frames) {
    const check = checkFrame(acceptedFrames, frame);
    if (!check.ok) {
      rejected.push({ t_ms: frame.t_ms, reason: check.reason ?? "invalid_frame" });
      continue;
    }
    const stored = {
      ...frame,
      id: `frm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      session_id: sessionId,
    };
    await saveFrame(stored);
    acceptedFrames.push(stored);
  }

  return {
    session_id: sessionId,
    accepted: frames.length - rejected.length,
    rejected,
    progress: scanProgress(acceptedFrames),
  };
}

export async function getScanState(sessionId: string) {
  const result = await getScan(sessionId);
  if (!result) return null;
  return {
    session: result.session,
    progress: scanProgress(result.frames),
    frames: result.frames,
  };
}

export async function finishScan(sessionId: string) {
  const session = await completeScan(sessionId);
  if (!session) return null;
  const state = await getScanState(sessionId);
  return { session, progress: state?.progress ?? scanProgress([]) };
}
