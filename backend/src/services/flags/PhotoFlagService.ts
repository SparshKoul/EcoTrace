/** Phase 4.5 — photo abuse flagging with automatic hide at 3+ distinct reporters. */

import { addFlag, tallyFlags, type PhotoFlagState } from "../../domain/flags/PhotoFlags.js";
import { addFlag as persistFlag, getReport, listFlags } from "../phase4Repository.js";

export interface FlagResult {
  readonly photo_id: string;
  readonly reporter_id: string;
  readonly state: PhotoFlagState;
}

export async function flagPhoto(
  photoId: string,
  reporterId: string,
  reason?: string,
): Promise<FlagResult | null> {
  const report = await getReport(photoId);
  if (!report) return null;

  const existing = await listFlags(photoId);
  const next = addFlag(existing, { photoId, reporterId, reason, createdAt: new Date().toISOString() });
  if (next.length === existing.length) {
    return { photo_id: photoId, reporter_id: reporterId, state: tallyFlags(existing) };
  }

  await persistFlag(photoId, reporterId, reason);
  return { photo_id: photoId, reporter_id: reporterId, state: tallyFlags(next) };
}

export async function getPhotoFlagState(photoId: string): Promise<PhotoFlagState> {
  return tallyFlags(await listFlags(photoId));
}
