/**
 * Phase 4.5 — photo abuse flagging.
 * Three or more distinct reporters hide a photo pending moderation.
 */

export const PHOTO_FLAG_HIDE_THRESHOLD = 3;

export interface PhotoFlagRecord {
  readonly photoId: string;
  readonly reporterId: string;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface PhotoFlagState {
  readonly count: number;
  readonly hidden: boolean;
  readonly distinctReporters: number;
  readonly threshold: number;
}

export function tallyFlags(flags: readonly PhotoFlagRecord[]): PhotoFlagState {
  const distinct = new Set(flags.map((flag) => flag.reporterId));
  const count = distinct.size;
  return {
    count,
    distinctReporters: count,
    hidden: count >= PHOTO_FLAG_HIDE_THRESHOLD,
    threshold: PHOTO_FLAG_HIDE_THRESHOLD,
  };
}

/** A reporter can only flag a given photo once. */
export function addFlag(
  flags: readonly PhotoFlagRecord[],
  record: PhotoFlagRecord,
): PhotoFlagRecord[] {
  if (flags.some((flag) => flag.photoId === record.photoId && flag.reporterId === record.reporterId)) {
    return [...flags];
  }
  return [...flags, record];
}
