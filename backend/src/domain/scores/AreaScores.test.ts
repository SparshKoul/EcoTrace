import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AREA_SCORE_MIN_REPORTERS,
  computeAreaScoreDetails,
  rankAreas,
  scoreGrade,
} from "./AreaScores.js";

describe("area cleanliness scoring (Phase 5.1 / 5.2)", () => {
  it("locks scores below ten reporters", () => {
    assert.equal(AREA_SCORE_MIN_REPORTERS, 10);
    const result = computeAreaScoreDetails({
      reporterCount: 9, cleanedCount: 5, openCount: 5, avgCleanupHours: 10,
    });
    assert.equal(result.score, null);
    assert.equal(result.locked, true);
    assert.equal(result.needed, 1);
  });

  it("combines resolution rate and cleanup velocity at the quorum", () => {
    const result = computeAreaScoreDetails({
      reporterCount: 10, cleanedCount: 5, openCount: 5, reopenedCount: 0, avgCleanupHours: 24,
    });
    assert.equal(result.resolutionRate, 50);
    assert.equal(result.velocityScore, 52);
    assert.equal(result.score, 51);
    assert.equal(scoreGrade(result.score!), "warn");
  });

  it("caps the reopen penalty at 30 points", () => {
    const result = computeAreaScoreDetails({
      reporterCount: 10, cleanedCount: 10, openCount: 0, reopenedCount: 20, avgCleanupHours: 0,
    });
    assert.equal(result.reopenPenalty, 30);
    assert.equal(result.score, 70);
  });

  it("ranks worst first and puts locked areas last", () => {
    const ranked = rankAreas([
      { id: "a", name: "A", score: 80 },
      { id: "b", name: "B", score: 20 },
      { id: "c", name: "C", score: null },
    ]);
    assert.deepEqual(ranked.map((area) => area.id), ["b", "a", "c"]);
  });
});
