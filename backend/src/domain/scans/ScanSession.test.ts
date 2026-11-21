import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkFrame, MAX_SCAN_FRAMES, scanProgress } from "./ScanSession.js";

const frame = (t_ms: number) => ({ t_ms, photoUrl: `https://example.com/f${t_ms}.jpg` });

describe("scan session rules (Phase 5.3)", () => {
  it("requires strictly increasing frame timestamps", () => {
    assert.equal(checkFrame([frame(0)], frame(0)).reason, "t_ms_not_monotonic");
    assert.equal(checkFrame([frame(100)], frame(50)).reason, "t_ms_not_monotonic");
    assert.equal(checkFrame([frame(100)], frame(200)).ok, true);
  });

  it("rejects frames beyond the 60 second limit and missing photos", () => {
    assert.equal(checkFrame([], { t_ms: 60_001, photoUrl: "x" }).reason, "scan_too_long");
    assert.equal(checkFrame([], { t_ms: 10, photoUrl: "" }).reason, "photo_url_required");
  });

  it("caps the number of frames", () => {
    const frames = Array.from({ length: MAX_SCAN_FRAMES }, (_, index) => frame(index));
    assert.equal(checkFrame(frames, frame(MAX_SCAN_FRAMES)).reason, "too_many_frames");
  });

  it("reports progress from the last frame and GPS fix count", () => {
    const frames = [
      { ...frame(0), latitude: 30.5, longitude: 76.6 },
      frame(250),
    ];
    assert.deepEqual(scanProgress(frames), { frameCount: 2, durationMs: 250, gpsFixCount: 1 });
  });
});
