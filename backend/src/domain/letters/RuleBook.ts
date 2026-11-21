/**
 * Phase 3.3 — local verified corpus of government gazette extracts.
 * Data lives in backend/data/rules and is extracted from the gitignored reference repo;
 * no code is imported from that repo.
 */

import fs from "node:fs";
import path from "node:path";

export interface RuleText {
  readonly text_file: string;
  readonly text_sha256: string;
  readonly document: string;
  readonly language: string;
  readonly source_url: string;
  readonly source_sha256: string;
  readonly pages?: readonly number[];
}

export interface RuleEntry {
  readonly rule_id: string;
  readonly document: string;
  readonly clause: string;
  readonly clause_marker?: string;
  readonly exact_text: string;
  readonly page?: number;
  readonly language: string;
  readonly text_file: string;
  readonly source_url: string;
  readonly source_sha256: string;
}

export interface RuleBookData {
  readonly texts: readonly RuleText[];
  readonly rules: readonly RuleEntry[];
}

let cached: RuleBookData | null = null;

/** Resolve the corpus from the working directory first, then from the source tree. */
function corpusPath(): string {
  const candidates = [
    path.join(process.cwd(), "data", "rules", "rules.json"),
    path.resolve(process.cwd(), "..", "..", "data", "rules", "rules.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export function loadRuleBook(): RuleBookData {
  if (cached) return cached;
  const raw = fs.readFileSync(corpusPath(), "utf-8");
  cached = JSON.parse(raw) as RuleBookData;
  return cached;
}

export function findRule(ruleId: string): RuleEntry | undefined {
  return loadRuleBook().rules.find((rule) => rule.rule_id === ruleId);
}

export function resetRuleBookCache(): void {
  cached = null;
}

/** Stable rule selection by waste stream; the letter never invents a clause. */
const STREAM_RULES: Record<string, readonly string[]> = {
  mixed: ["swm-2026-15-1", "swm-2026-5-1-f", "swm-2026-39-2-vii"],
  plastic: ["pwm-2026-12-3a", "swm-2026-5-1-f"],
  organic: ["swm-2026-39-4", "swm-2026-5-1-f"],
  construction: ["cnd-2025-9-1-d", "swm-2026-15-1"],
  water: ["swm-2026-39-2-ix", "water-1974-24-1-a"],
  hazardous: ["swm-2026-41-4", "swm-2026-5-1-f"],
  none: ["swm-2026-39-2-x", "swm-2026-39-2-xi"],
};

export function ruleIdsForWasteStream(stream: string | undefined): readonly string[] {
  return STREAM_RULES[stream ?? ""] ?? STREAM_RULES.mixed!;
}
