/** Phase 5.1 / 5.2 — area cleanliness scores and worst-first city leaderboard. */

import {
  computeAreaScoreDetails,
  rankAreas,
  scoreGrade,
  type AreaKind,
} from "../../domain/scores/AreaScores.js";
import { listAreaAggregates, type AreaAggregate } from "../phase5Repository.js";

export interface AreaScoreView {
  readonly id: string;
  readonly name: string;
  readonly kind: AreaKind;
  readonly reporterCount: number;
  readonly cleanedCount: number;
  readonly openCount: number;
  readonly reopenedCount: number;
  readonly avgCleanupHours: number | null;
  readonly score: number | null;
  readonly grade: "good" | "warn" | "bad" | null;
  readonly locked: boolean;
  readonly needed: number;
  readonly resolutionRate: number;
  readonly velocityScore: number;
  readonly reopenPenalty: number;
}

function toView(aggregate: AreaAggregate): AreaScoreView {
  const details = computeAreaScoreDetails(aggregate);
  return {
    id: aggregate.id,
    name: aggregate.name,
    kind: aggregate.kind,
    reporterCount: aggregate.reporterCount,
    cleanedCount: aggregate.cleanedCount,
    openCount: aggregate.openCount,
    reopenedCount: aggregate.reopenedCount,
    avgCleanupHours: aggregate.avgCleanupHours,
    score: details.score,
    grade: details.score === null ? null : scoreGrade(details.score),
    locked: details.locked,
    needed: details.needed,
    resolutionRate: details.resolutionRate,
    velocityScore: details.velocityScore,
    reopenPenalty: details.reopenPenalty,
  };
}

export async function listAreaScores(kind: AreaKind): Promise<AreaScoreView[]> {
  return (await listAreaAggregates(kind)).map(toView);
}

export async function getAreaScore(kind: AreaKind, id: string): Promise<AreaScoreView | null> {
  const areas = await listAreaScores(kind);
  return areas.find((area) => area.id === id || area.name === id) ?? null;
}

export interface RankingEntry extends AreaScoreView {
  readonly rank: number;
}

export async function getCityRanking(cityId: string): Promise<RankingEntry[]> {
  const kinds: readonly AreaKind[] = ["ward", "mla", "mp"];
  const groups = await Promise.all(kinds.map((kind) => listAreaScores(kind)));
  const all = groups.flat();
  const needle = cityId.toLowerCase();
  const scoped = all.filter((area) => area.name.toLowerCase().includes(needle));
  return rankAreas(scoped)
    .filter((area) => area.score !== null)
    .map((area, index) => ({ ...area, rank: index + 1 }));
}
