/**
 * Phase 5.1 — area cleanliness scoring (0-100).
 * Composite of resolution rate (cleanup vs backlog), cleanup velocity, and a reopen penalty.
 * Scores stay locked until the locality has 10 distinct reporters (PRD Sybil threshold).
 */

export type AreaKind = "ward" | "mla" | "mp";
export const AREA_SCORE_MIN_REPORTERS = 10;

export interface AreaScoreInput {
  readonly reporterCount: number;
  readonly cleanedCount: number;
  readonly openCount: number;
  readonly reopenedCount?: number;
  /** Mean hours from first report to clean; null when nothing has been cleaned yet. */
  readonly avgCleanupHours?: number | null;
}

export interface AreaScoreResult {
  readonly score: number | null;
  readonly resolutionRate: number;
  readonly velocityScore: number;
  readonly reopenPenalty: number;
  readonly locked: boolean;
  readonly needed: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function computeAreaScoreDetails(input: AreaScoreInput): AreaScoreResult {
  const needed = Math.max(0, AREA_SCORE_MIN_REPORTERS - input.reporterCount);
  const settled = input.cleanedCount + input.openCount;
  const resolutionRate = settled === 0 ? 0 : clamp((input.cleanedCount / settled) * 100);
  const velocityScore = input.avgCleanupHours == null
    ? 40
    : clamp(100 - input.avgCleanupHours * 2);
  const reopenPenalty = Math.min(30, (input.reopenedCount ?? 0) * 5);
  const locked = needed > 0;
  const score = locked
    ? null
    : clamp(resolutionRate * 0.6 + velocityScore * 0.4 - reopenPenalty);

  return { score, resolutionRate, velocityScore, reopenPenalty, locked, needed };
}

export function scoreGrade(score: number): "good" | "warn" | "bad" {
  if (score >= 70) return "good";
  if (score >= 40) return "warn";
  return "bad";
}

/** Worst first — the leaderboard drives accountability, not celebration. */
export function rankAreas<T extends { readonly id: string; readonly name: string; readonly score: number | null }>(
  areas: readonly T[],
): T[] {
  return [...areas].sort((a, b) => {
    const left = a.score ?? Number.POSITIVE_INFINITY;
    const right = b.score ?? Number.POSITIVE_INFINITY;
    return left - right || a.name.localeCompare(b.name);
  });
}
