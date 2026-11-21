import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addFlag, PHOTO_FLAG_HIDE_THRESHOLD, tallyFlags, type PhotoFlagRecord } from "./PhotoFlags.js";

const flag = (reporterId: string) => ({
  photoId: "rpt_demo_1",
  reporterId,
  createdAt: new Date().toISOString(),
});

describe("photo abuse flags (Phase 4.5)", () => {
  it("hides a photo only at three distinct reporters", () => {
    assert.equal(PHOTO_FLAG_HIDE_THRESHOLD, 3);
    let flags: PhotoFlagRecord[] = [];
    flags = addFlag(flags, flag("a"));
    flags = addFlag(flags, flag("b"));
    assert.equal(tallyFlags(flags).hidden, false);
    flags = addFlag(flags, flag("c"));
    assert.equal(tallyFlags(flags).hidden, true);
    assert.equal(tallyFlags(flags).count, 3);
  });

  it("ignores a repeat flag from the same reporter", () => {
    const first = addFlag([], flag("a"));
    const second = addFlag(first, flag("a"));
    assert.equal(second.length, 1);
    assert.equal(tallyFlags(second).hidden, false);
  });
});
