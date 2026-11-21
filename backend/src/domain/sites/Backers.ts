/**
 * Phase 3.4 — 10-Backer Rule.
 * A site becomes verified once 10 distinct authenticated users back it.
 * Distinctness is enforced by a Set (or the composite DB key) so repeat taps never count twice.
 */

export const BACKERS_REQUIRED = 10;

export interface BackerState {
  readonly count: number;
  readonly needed: number;
  readonly verified: boolean;
  /** Verified sites are escalated for civic attention. */
  readonly escalated: boolean;
  readonly severityBoost: number;
}

export function evaluateBackers(distinctCount: number): BackerState {
  const verified = distinctCount >= BACKERS_REQUIRED;
  return {
    count: distinctCount,
    needed: Math.max(0, BACKERS_REQUIRED - distinctCount),
    verified,
    escalated: verified,
    severityBoost: verified ? 10 : 0,
  };
}

/** Adds a user id to the backing set. Returns false when that user already backed the site. */
export function addBacker(set: Set<string>, userId: string): boolean {
  if (!userId || set.has(userId)) return false;
  set.add(userId);
  return true;
}
