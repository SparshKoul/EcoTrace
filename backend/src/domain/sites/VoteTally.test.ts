import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkVoteProximity,
  recordVote,
  shouldRejectSite,
  tallyVotes,
  VOTE_RADIUS_M,
} from "./VoteTally.js";

describe("community voting (Phase 4.1)", () => {
  it("keeps only the latest vote per user", () => {
    const first = recordVote([], "u1", "confirm");
    const second = recordVote(first, "u1", "reject");
    assert.equal(second.length, 1);
    assert.equal(second[0]?.vote, "reject");
    assert.equal(tallyVotes(second).voters, 1);
  });

  it("tallies each vote category", () => {
    const votes = [
      ...recordVote([], "u1", "confirm"),
      ...recordVote([], "u2", "reject"),
      ...recordVote([], "u3", "cleaned"),
    ];
    assert.deepEqual(tallyVotes(votes), { confirm: 1, reject: 1, cleaned: 1, voters: 3 });
  });

  it("enforces the 1000 m voting radius", () => {
    const site = { latitude: 30.5157, longitude: 76.6592 };
    assert.equal(VOTE_RADIUS_M, 1000);
    assert.equal(checkVoteProximity(site, { latitude: 30.5161, longitude: 76.6592 }).ok, true);
    assert.equal(checkVoteProximity(site, { latitude: 30.53, longitude: 76.6592 }).ok, false);
  });

  it("rejects a site only at three more rejects than backers", () => {
    assert.equal(shouldRejectSite(10, 12), false);
    assert.equal(shouldRejectSite(10, 13), true);
    assert.equal(shouldRejectSite(0, 3), true);
  });
});
