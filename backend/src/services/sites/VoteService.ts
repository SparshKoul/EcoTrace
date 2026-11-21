/** Phase 4.1 — community voting: one latest vote per user, confirm votes feed the 10-backer quorum. */

import {
  checkVoteProximity,
  shouldRejectSite,
  tallyVotes,
  type VoteKind,
} from "../../domain/sites/VoteTally.js";
import { getSite, saveSite } from "./phase3Repository.js";
import { backSite } from "./BackerService.js";
import { listVotes, upsertVote } from "../phase4Repository.js";

export interface CastVoteInput {
  readonly siteId: string;
  readonly userId: string;
  readonly vote: VoteKind;
  readonly latitude: number;
  readonly longitude: number;
}

export interface VoteResult {
  readonly siteId: string;
  readonly tally: ReturnType<typeof tallyVotes>;
  readonly distanceM: number;
  readonly withinRadius: boolean;
  readonly backers?: Awaited<ReturnType<typeof backSite>>;
  readonly siteRejected: boolean;
}

export async function castVote(input: CastVoteInput): Promise<VoteResult | null> {
  const site = await getSite(input.siteId);
  if (!site) return null;

  const proximity = checkVoteProximity(site, { latitude: input.latitude, longitude: input.longitude });
  if (!proximity.ok) {
    // Distance is reported to the caller, which turns it into a 400 response.
    return { siteId: input.siteId, tally: tallyVotes(await listVotes(input.siteId)),
      distanceM: proximity.distanceM, withinRadius: false, siteRejected: false };
  }

  await upsertVote(input);
  const votes = await listVotes(input.siteId);
  const tally = tallyVotes(votes);

  // A confirm vote is also a backer, matching the reference's "confirm or photo" backing rule.
  const backers = input.vote === "confirm" ? await backSite(input.siteId, input.userId) ?? undefined : undefined;
  const backerCount = backers?.count ?? site.backersCount;

  let siteRejected = false;
  if (shouldRejectSite(backerCount, tally.reject)) {
    await saveSite({ ...site, verification: "rejected", status: "removed", lastActivityAt: new Date().toISOString() });
    siteRejected = true;
  }

  return { siteId: input.siteId, tally, distanceM: proximity.distanceM, withinRadius: true, backers, siteRejected };
}

export async function getVoteState(siteId: string) {
  return tallyVotes(await listVotes(siteId));
}
