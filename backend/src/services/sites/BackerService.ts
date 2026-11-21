/** Phase 3.4 — community quorum verification (10 distinct backers). */

import { evaluateBackers, type BackerState } from "../../domain/sites/Backers.js";
import {
  addBacker as persistBacker,
  getSite,
  listBackers,
  saveSite,
} from "./phase3Repository.js";
import type { StoredSite } from "../phase3Store.js";

export interface BackerResult extends BackerState {
  readonly site: StoredSite;
  readonly newlyAdded: boolean;
  readonly justVerified: boolean;
}

export async function backSite(siteId: string, userId: string): Promise<BackerResult | null> {
  const site = await getSite(siteId);
  if (!site) return null;

  // Idempotent: a repeat back never increases the count.
  const alreadyBacked = (await listBackers(siteId)).some((record) => record.user_id === userId);
  const added = alreadyBacked ? false : await persistBacker(siteId, userId);
  const records = await listBackers(siteId);
  const state = evaluateBackers(records.length);
  const justVerified = state.verified && site.verification !== "verified";

  const updatedSite: StoredSite = {
    ...site,
    backersCount: state.count,
    verification: state.verified ? "verified" : site.verification,
    severity: Math.min(100, site.severity + (justVerified ? state.severityBoost : 0)),
    status:
      justVerified && (site.status === "open" || site.status === "reopened")
        ? "verified"
        : site.status,
    lastActivityAt: new Date().toISOString(),
  };
  await saveSite(updatedSite);

  return { ...state, site: updatedSite, newlyAdded: added, justVerified };
}

export async function getBackerState(siteId: string): Promise<BackerState | null> {
  const site = await getSite(siteId);
  if (!site) return null;
  const records = await listBackers(siteId);
  const state = evaluateBackers(records.length);
  return { ...state, count: Math.max(state.count, Number(site.backersCount) || 0) };
}
