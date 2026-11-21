/** Phase 3.1 / 3.5 — cleanup claim pipeline and AI validation orchestration. */

import { randomUUID } from "node:crypto";
import {
  applyCleanupDecision,
  canStartCleanup,
  checkNearSite,
  CLEANUP_STARTED,
  type CleanupSiteState,
} from "../../domain/sites/SiteCleanup.js";
import {
  getClaim,
  getSite,
  listClaims,
  saveClaim,
  saveSite,
  updateClaim,
} from "./phase3Repository.js";
import {
  cleanupValidator,
  type CleanupValidationInput,
} from "./CleanupValidator.js";
import type { CleanupClaimRecord, StoredSite } from "../phase3Store.js";

export interface StartCleanupInput {
  readonly siteId: string;
  readonly afterPhotoUrl: string;
  readonly uploaderId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM?: number;
}

export type StartResult =
  | { readonly ok: true; readonly claim: CleanupClaimRecord; readonly site: StoredSite }
  | { readonly ok: false; readonly statusCode: number; readonly reason: string };

export async function startCleanup(input: StartCleanupInput): Promise<StartResult> {
  const site = await getSite(input.siteId);
  if (!site) return { ok: false, statusCode: 404, reason: "site_not_found" };

  const siteState: CleanupSiteState = {
    status: site.status as CleanupSiteState["status"],
    cleanupStatus: site.cleanupStatus as CleanupSiteState["cleanupStatus"],
  };
  const allowed = canStartCleanup(siteState);
  if (!allowed.ok) {
    return { ok: false, statusCode: allowed.statusCode ?? 409, reason: allowed.reason ?? "cleanup_blocked" };
  }

  const near = checkNearSite(site, {
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyM: input.accuracyM,
  });
  if (!near.ok) {
    return { ok: false, statusCode: near.statusCode ?? 400, reason: near.reason ?? "not_near_site" };
  }

  const now = new Date().toISOString();
  const claim: CleanupClaimRecord = {
    id: randomUUID(),
    site_id: site.id,
    after_photo_url: input.afterPhotoUrl,
    uploader_id: input.uploaderId,
    latitude: input.latitude,
    longitude: input.longitude,
    distance_m: near.distanceM,
    status: "checking",
    created_at: now,
  };

  const updatedSite: StoredSite = {
    ...site,
    status: CLEANUP_STARTED.siteStatus,
    cleanupStatus: CLEANUP_STARTED.cleanupStatus,
    afterPhotoUrl: input.afterPhotoUrl,
    lastActivityAt: now,
  };

  await saveClaim(claim);
  await saveSite(updatedSite);
  return { ok: true, claim, site: updatedSite };
}

export interface ValidateResult {
  readonly claim: CleanupClaimRecord;
  readonly site: StoredSite;
}

/** Explicit decision wins; otherwise the AI validator (or offline check) decides. */
export async function validateCleanup(
  claimId: string,
  input: Partial<CleanupValidationInput> & { decision?: "accepted" | "rejected"; reason?: string } = {},
): Promise<ValidateResult | null> {
  const claim = await getClaim(claimId);
  if (!claim) return null;
  const site = await getSite(claim.site_id);
  if (!site) return null;

  const decision = input.decision;
  const result = decision
    ? {
        accepted: decision === "accepted",
        confidence: Number(input.confidence ?? 1),
        reason: input.reason ?? `manual_${decision}`,
        source: "manual" as const,
      }
    : await cleanupValidator.validate({
        siteId: site.id,
        afterPhotoUrl: claim.after_photo_url,
        distanceM: claim.distance_m,
      });

  const next = applyCleanupDecision(result.accepted ? "accepted" : "rejected");
  const now = new Date().toISOString();

  const updatedSite: StoredSite = {
    ...site,
    status: next.siteStatus,
    cleanupStatus: next.cleanupStatus,
    lastActivityAt: now,
  };
  const updatedClaim: CleanupClaimRecord = {
    ...claim,
    status: result.accepted ? "accepted" : "rejected",
    ai_confidence: result.confidence,
    reason: result.reason,
    validated_at: now,
  };

  await saveSite(updatedSite);
  await updateClaim(updatedClaim);
  return { claim: updatedClaim, site: updatedSite };
}

export async function listCleanupClaims(siteId: string): Promise<CleanupClaimRecord[]> {
  return listClaims(siteId);
}
