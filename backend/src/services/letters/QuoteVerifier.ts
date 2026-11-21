/**
 * Phase 3.3 — deterministic, zero-hallucination rule quote verifier.
 * A citation is accepted only when its quote is an exact (whitespace-normalised)
 * substring of the verified corpus entry and has non-word boundaries.
 * Any failed quote is stripped before the letter reaches the citizen.
 */

import {
  findRule,
  loadRuleBook,
  type RuleEntry,
} from "../../domain/letters/RuleBook.js";

export interface CitationInput {
  readonly rule_id: string;
  readonly quote: string;
}

export interface VerifiedCitation {
  readonly rule_id: string;
  readonly document: string;
  readonly clause: string;
  readonly quote: string;
  readonly source_sha256: string;
}

export interface FailedCitation {
  readonly rule_id: string;
  readonly reason: string;
}

export interface VerificationResult {
  readonly verified: readonly VerifiedCitation[];
  readonly failed: readonly FailedCitation[];
  readonly verifier: { verified: number; total: number };
  readonly allVerified: boolean;
}

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;

export function verifyQuote(rule: RuleEntry, quote: string): { ok: true } | { ok: false; reason: string } {
  const haystack = normalise(rule.exact_text);
  const needle = normalise(quote);
  if (!needle) return { ok: false, reason: "empty_quote" };

  const index = haystack.indexOf(needle);
  if (index < 0) return { ok: false, reason: "quote_not_in_corpus" };

  const before = index === 0 ? "" : haystack[index - 1]!;
  const afterIndex = index + needle.length;
  const after = afterIndex >= haystack.length ? "" : haystack[afterIndex]!;
  if (before && WORD_CHAR.test(before)) return { ok: false, reason: "quote_mid_word" };
  if (after && WORD_CHAR.test(after)) return { ok: false, reason: "quote_mid_word" };

  const text = loadRuleBook().texts.find((entry) => entry.text_file === rule.text_file);
  if (!text || text.source_sha256 !== rule.source_sha256) {
    return { ok: false, reason: "source_hash_mismatch" };
  }
  return { ok: true };
}

export function verifyCitations(citations: readonly CitationInput[]): VerificationResult {
  const verified: VerifiedCitation[] = [];
  const failed: FailedCitation[] = [];

  for (const citation of citations) {
    const rule = findRule(citation.rule_id);
    if (!rule) {
      failed.push({ rule_id: citation.rule_id, reason: "unknown_rule" });
      continue;
    }
    const outcome = verifyQuote(rule, citation.quote);
    if (!outcome.ok) {
      failed.push({ rule_id: citation.rule_id, reason: outcome.reason });
      continue;
    }
    verified.push({
      rule_id: rule.rule_id,
      document: rule.document,
      clause: rule.clause,
      quote: normalise(citation.quote),
      source_sha256: rule.source_sha256,
    });
  }

  return {
    verified,
    failed,
    verifier: { verified: verified.length, total: citations.length },
    allVerified: failed.length === 0,
  };
}

/** Builds citations straight from the corpus, so quotes are verified by construction. */
export function citationsFromRuleIds(ruleIds: readonly string[]): CitationInput[] {
  return ruleIds.flatMap((ruleId) => {
    const rule = findRule(ruleId);
    return rule ? [{ rule_id: rule.rule_id, quote: rule.exact_text }] : [];
  });
}
