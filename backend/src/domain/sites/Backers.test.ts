import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addBacker, BACKERS_REQUIRED, evaluateBackers } from "./Backers.js";

describe("10-backer quorum (Phase 3.4)", () => {
  it("keeps a site unverified below ten distinct backers", () => {
    const state = evaluateBackers(9);
    assert.equal(BACKERS_REQUIRED, 10);
    assert.equal(state.verified, false);
    assert.equal(state.escalated, false);
    assert.equal(state.needed, 1);
    assert.equal(state.severityBoost, 0);
  });

  it("verifies and escalates at exactly ten distinct backers", () => {
    const state = evaluateBackers(10);
    assert.equal(state.verified, true);
    assert.equal(state.escalated, true);
    assert.equal(state.needed, 0);
    assert.equal(state.severityBoost, 10);
  });

  it("counts each person only once", () => {
    const set = new Set<string>();
    assert.equal(addBacker(set, "user-1"), true);
    assert.equal(addBacker(set, "user-1"), false);
    assert.equal(addBacker(set, "user-2"), true);
    assert.equal(set.size, 2);
  });
});
