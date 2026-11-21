import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRule } from "../../domain/letters/RuleBook.js";
import {
  citationsFromRuleIds,
  verifyCitations,
  verifyQuote,
} from "./QuoteVerifier.js";
import { draftLetter } from "./LetterDrafter.js";

const rule = findRule("swm-2026-5-1-f")!;

describe("SWM rule quote verifier (Phase 3.3)", () => {
  it("accepts an exact quote from the verified corpus", () => {
    assert.deepEqual(verifyQuote(rule, rule.exact_text), { ok: true });
  });

  it("normalises whitespace runs before comparing", () => {
    assert.deepEqual(verifyQuote(rule, rule.exact_text.replace(/\s+/g, "   ")), { ok: true });
  });

  it("rejects a quote that is not in the corpus", () => {
    const result = verifyQuote(rule, "every dump site must be cleared within two days");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "quote_not_in_corpus");
  });

  it("rejects a quote that starts mid-word", () => {
    const result = verifyQuote(rule, "hrow, burn or bury");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "quote_mid_word");
  });

  it("strips unknown rules and reports verification counts", () => {
    const result = verifyCitations([
      { rule_id: rule.rule_id, quote: rule.exact_text },
      { rule_id: "made-up-rule", quote: "anything" },
    ]);
    assert.equal(result.verified.length, 1);
    assert.equal(result.failed[0]?.reason, "unknown_rule");
    assert.deepEqual(result.verifier, { verified: 1, total: 2 });
    assert.equal(result.allVerified, false);
  });

  it("drafts a letter whose citations all verify", () => {
    const letter = draftLetter({
      id: "site-1",
      wasteType: "mixed",
      latitude: 30.5157,
      longitude: 76.6592,
      status: "open",
      backers_count: 3,
      ward_name: "Rajpura Municipal Council",
      mla_constituency: "Rajpura Assembly Constituency",
      mp_constituency: "Patiala Parliamentary Constituency",
    });
    assert.equal(letter.template_fallback, false);
    assert.ok(letter.citations.length > 0);
    assert.deepEqual(letter.verifier, {
      verified: letter.citations.length,
      total: letter.citations.length,
    });
    assert.match(letter.to, /Municipal Commissioner/);
    assert.equal(letter.cc.length, 2);
    assert.match(letter.body, /has not been sent automatically/);
    assert.ok(citationsFromRuleIds(["swm-2026-15-1"]).length === 1);
  });
});
