/**
 * Phase 3.1 / 3.5 — cleanup claim lifecycle and AI validation state transitions.
 * Mirrors the reference rule that an after-photo must be taken within 50 m of the site.
 */

import { haversineDistance } from "../../services/sites/siteMerger.js";

export const CLEANUP_NEAR_SITE_M = 50;

export type CleanupStatus = "none" | "checking" | "accepted" | "rejected";
export type SiteStatus = "open" | "verified" | "cleaning" | "cleaned" | "reopened" | "expired" | "removed";

export interface CleanupSiteState {
  readonly status: SiteStatus;
  readonly cleanupStatus: CleanupStatus;
}

export interface CleanupDecision {
  readonly siteStatus: SiteStatus;
  readonly cleanupStatus: CleanupStatus;
}

export interface GpsSample {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM?: number;
}

export interface StartCheck {
  readonly ok: boolean;
  readonly reason?: string;
  readonly statusCode?: number;
  readonly distanceM?: number;
}

export function distanceFromSite(site: { latitude: number; longitude: number }, gps: GpsSample): number {
  return haversineDistance(site.latitude, site.longitude, gps.latitude, gps.longitude);
}

export function checkNearSite(site: { latitude: number; longitude: number }, gps: GpsSample): StartCheck {
  const distanceM = distanceFromSite(site, gps);
  if (distanceM > CLEANUP_NEAR_SITE_M) {
    return {
      ok: false,
      reason: `after-photo is ${Math.ceil(distanceM)} m from the site; limit ${CLEANUP_NEAR_SITE_M} m`,
      statusCode: 400,
      distanceM,
    };
  }
  return { ok: true, distanceM };
}

export function canStartCleanup(site: CleanupSiteState): StartCheck {
  if (site.status === "cleaned") return { ok: false, reason: "already_cleaned", statusCode: 409 };
  if (site.status === "expired" || site.status === "removed") {
    return { ok: false, reason: "site_unavailable", statusCode: 409 };
  }
  if (site.cleanupStatus === "checking") return { ok: false, reason: "cleanup_pending", statusCode: 409 };
  return { ok: true };
}

/** Result of starting a claim: the site enters `cleaning` while the AI check runs. */
export const CLEANUP_STARTED: CleanupDecision = { siteStatus: "cleaning", cleanupStatus: "checking" };

export function applyCleanupDecision(decision: "accepted" | "rejected"): CleanupDecision {
  return decision === "accepted"
    ? { siteStatus: "cleaned", cleanupStatus: "accepted" }
    : { siteStatus: "reopened", cleanupStatus: "rejected" };
}
