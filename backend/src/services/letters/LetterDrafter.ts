/**
 * Phase 3.2 — Civic letter drafting engine.
 * Generates a formal grievance to the Municipal Commissioner with MLA/MP in CC.
 * Quotes come only from the verified corpus and are re-checked by QuoteVerifier.
 */

import { BACKERS_REQUIRED } from "../../domain/sites/Backers.js";
import { ruleIdsForWasteStream } from "../../domain/letters/RuleBook.js";
import {
  citationsFromRuleIds,
  verifyCitations,
  type VerifiedCitation,
} from "./QuoteVerifier.js";

export interface LetterSite {
  readonly id: string;
  readonly wasteType?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: string;
  readonly severity?: number;
  readonly backers_count?: number;
  readonly reportCount?: number;
  readonly first_reported_at?: string | Date;
  readonly ward_name?: string;
  readonly mla_constituency?: string;
  readonly mp_constituency?: string;
  readonly photoUrl?: string;
}

export interface LetterDraft {
  readonly letter_id: string;
  readonly site_id: string;
  readonly channel: "local_body";
  readonly to: string;
  readonly cc: string[];
  readonly subject: string;
  readonly body: string;
  readonly language: "en";
  readonly citations: readonly VerifiedCitation[];
  readonly verifier: { verified: number; total: number };
  readonly template_fallback: boolean;
  readonly provider: string;
  readonly model: string;
  readonly version: string;
  readonly created_at: string;
  readonly evidence: Record<string, unknown>;
}

export function draftLetter(site: LetterSite): LetterDraft {
  const ruleIds = ruleIdsForWasteStream(site.wasteType);
  const verification = verifyCitations(citationsFromRuleIds(ruleIds));
  const ulb = site.ward_name || "the Urban Local Body";
  const mla = site.mla_constituency || "MLA constituency office";
  const mp = site.mp_constituency || "MP constituency office";

  const quoteLines = verification.verified.map(
    (citation) => `"${citation.quote}" — ${citation.document}, rule ${citation.clause}.`,
  );
  const templateFallback = !verification.allVerified || quoteLines.length === 0;

  const paragraphs = [
    `To,\nThe Municipal Commissioner,\n${ulb}`,
    `CC: ${mla}; ${mp} (for attention)`,
    "",
    `Subject: Unaddressed solid waste at verified site ${site.id}`,
    "",
    "Respected Sir/Madam,",
    `A citizen-reported waste site at latitude ${site.latitude.toFixed(5)}, longitude ${site.longitude.toFixed(5)} remains ${site.status}. The site has ${site.reportCount ?? site.backers_count ?? 1} reports and ${site.backers_count ?? 0} of ${BACKERS_REQUIRED} required backers.`,
    ...(templateFallback
      ? []
      : ["", "The following provisions of the Solid Waste Management Rules, 2026 are relevant:", ...quoteLines]),
    "",
    "We request that the site be mapped, assessed and remediated without delay, and that the preventive measures above be enforced. This is a citizen draft for review; it has not been sent automatically.",
    "",
    "Yours faithfully,\nA concerned citizen (via EcoTrace)",
  ];

  return {
    letter_id: `ltr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    site_id: site.id,
    channel: "local_body",
    to: `Municipal Commissioner, ${ulb}`,
    cc: [mla, mp],
    subject: `Unaddressed solid waste at verified site ${site.id}`,
    body: paragraphs.join("\n"),
    language: "en",
    citations: verification.verified,
    verifier: verification.verifier,
    template_fallback: templateFallback,
    provider: templateFallback ? "ecotrace-template" : "ecotrace-corpus",
    model: "swm-rules-2026-verified",
    version: "1.0",
    created_at: new Date().toISOString(),
    evidence: {
      report_count: site.reportCount ?? site.backers_count ?? 1,
      backers: { count: site.backers_count ?? 0, needed: BACKERS_REQUIRED },
      status: site.status,
      severity: site.severity ?? 0,
      location: { latitude: site.latitude, longitude: site.longitude },
      first_reported_at: site.first_reported_at ?? null,
      photo_urls: site.photoUrl ? [site.photoUrl] : [],
    },
  };
}
