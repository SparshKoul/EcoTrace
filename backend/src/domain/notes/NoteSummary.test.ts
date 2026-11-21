import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOfflineSummary, type CitizenNote } from "./NoteSummary.js";

const note = (id: string, content: string): CitizenNote => ({
  id, siteId: "site-1", content, createdAt: new Date().toISOString(),
});

describe("offline note briefing (Phase 4.3)", () => {
  it("handles an empty note list", () => {
    assert.match(buildOfflineSummary([]), /No citizen observations/);
  });

  it("summarises only the given citizen text", () => {
    const result = buildOfflineSummary([
      note("1", "Cleared every Friday"),
      note("2", "No dustbin nearby"),
    ]);
    assert.match(result, /2 citizen observations/);
    assert.match(result, /Cleared every Friday/);
    assert.match(result, /No dustbin nearby/);
  });

  it("caps the number of notes and reports the remainder", () => {
    const notes = Array.from({ length: 7 }, (_, index) => note(String(index), `Observation ${index}`));
    const result = buildOfflineSummary(notes, 5);
    assert.match(result, /7 citizen observations/);
    assert.match(result, /…and 2 more observations/);
  });
});
