/**
 * Phase 4.1 — community voting and backing.
 * One latest vote per user; confirm votes count toward the 10-backer quorum.
 */

import { haversineDistance } from "../../services/sites/siteMerger.js";

export type VoteKind = "confirm" | "reject" | "cleaned";

export interface VoteRecord {
  readonly userId: string;
  readonly vote: VoteKind;
  readonly createdAt: string;
}

export interface VoteTallyResult {
  readonly confirm: number;
  readonly reject: number;
  readonly cleaned: number;
  readonly voters: number;
}

export const VOTE_RADIUS_M = 1_000;
export const REJECT_SAFETY_MARGIN = 3;

/** Latest vote wins: re-voting replaces the user's previous entry instead of adding a second. */
export function recordVote(
  votes: readonly VoteRecord[],
  userId: string,
  vote: VoteKind,
): VoteRecord[] {
  return [...votes.filter((entry) => entry.userId !== userId), { userId, vote, createdAt: new Date().toISOString() }];
}

export function tallyVotes(votes: readonly VoteRecord[]): VoteTallyResult {
  return {
    confirm: votes.filter((entry) => entry.vote === "confirm").length,
    reject: votes.filter((entry) => entry.vote === "reject").length,
    cleaned: votes.filter((entry) => entry.vote === "cleaned").length,
    voters: new Set(votes.map((entry) => entry.userId)).size,
  };
}

export interface VoteProximity {
  readonly ok: boolean;
  readonly distanceM: number;
}

export function checkVoteProximity(
  site: { latitude: number; longitude: number },
  gps: { latitude: number; longitude: number },
  limitM = VOTE_RADIUS_M,
): VoteProximity {
  const distanceM = haversineDistance(site.latitude, site.longitude, gps.latitude, gps.longitude);
  return { ok: distanceM <= limitM, distanceM };
}

/** Safety valve: repeated rejections from people who never backed the site can remove it. */
export function shouldRejectSite(backerCount: number, rejectVoterCount: number): boolean {
  return rejectVoterCount - backerCount >= REJECT_SAFETY_MARGIN;
}
