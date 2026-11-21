/** Phase 5.3 — continuous scan session rules for synchronised GPS/video frames. */

export const MAX_SCAN_FRAMES = 600;
export const MAX_SCAN_DURATION_MS = 60_000;

export interface ScanFrameInput {
  readonly t_ms: number;
  readonly photoUrl: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly accuracyM?: number;
}

export interface FrameCheck {
  readonly ok: boolean;
  readonly reason?: string;
}

export function checkFrame(
  frames: readonly { t_ms: number }[],
  frame: ScanFrameInput,
): FrameCheck {
  if (!Number.isFinite(frame.t_ms) || frame.t_ms < 0) return { ok: false, reason: "invalid_t_ms" };
  if (frame.t_ms > MAX_SCAN_DURATION_MS) return { ok: false, reason: "scan_too_long" };
  if (!frame.photoUrl) return { ok: false, reason: "photo_url_required" };
  if (frames.length >= MAX_SCAN_FRAMES) return { ok: false, reason: "too_many_frames" };
  const last = frames.at(-1);
  if (last && frame.t_ms <= last.t_ms) return { ok: false, reason: "t_ms_not_monotonic" };
  return { ok: true };
}

export interface ScanProgress {
  readonly frameCount: number;
  readonly durationMs: number;
  readonly gpsFixCount: number;
}

export function scanProgress(frames: readonly (ScanFrameInput & { t_ms: number })[]): ScanProgress {
  return {
    frameCount: frames.length,
    durationMs: frames.at(-1)?.t_ms ?? 0,
    gpsFixCount: frames.filter((frame) => Number.isFinite(frame.latitude) && Number.isFinite(frame.longitude)).length,
  };
}
