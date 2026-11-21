import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCleanupDecision,
  canStartCleanup,
  checkNearSite,
  CLEANUP_STARTED,
} from "./SiteCleanup.js";

const site = { latitude: 30.5157, longitude: 76.6592 };

describe("cleanup lifecycle (Phase 3.1 / 3.5)", () => {
  it("accepts an after-photo inside the 50 m radius", () => {
    const result = checkNearSite(site, { latitude: site.latitude + 0.0002, longitude: site.longitude });
    assert.equal(result.ok, true);
    assert.ok((result.distanceM ?? 0) < 50);
  });

  it("rejects an after-photo farther than 50 m from the site", () => {
    const result = checkNearSite(site, { latitude: site.latitude + 0.001, longitude: site.longitude });
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 400);
    assert.match(String(result.reason), /limit 50 m/);
  });

  it("blocks a second claim while one is checking", () => {
    const result = canStartCleanup({ status: "cleaning", cleanupStatus: "checking" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cleanup_pending");
    assert.equal(result.statusCode, 409);
  });

  it("blocks cleanup on an already cleaned site", () => {
    const result = canStartCleanup({ status: "cleaned", cleanupStatus: "accepted" });
    assert.equal(result.reason, "already_cleaned");
  });

  it("moves the site to cleaning on start, then to cleaned or reopened", () => {
    assert.deepEqual(CLEANUP_STARTED, { siteStatus: "cleaning", cleanupStatus: "checking" });
    assert.deepEqual(applyCleanupDecision("accepted"), { siteStatus: "cleaned", cleanupStatus: "accepted" });
    assert.deepEqual(applyCleanupDecision("rejected"), { siteStatus: "reopened", cleanupStatus: "rejected" });
  });
});
