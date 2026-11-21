/** Phase 5.4 — before/after social share cards and links. */

import { buildShareCardSvg, buildShareText, type ShareCardData } from "../../domain/share/ShareCard.js";
import { listReportsBySite } from "../phase4Repository.js";
import { getSite } from "../sites/phase3Repository.js";

export interface ShareCardResult {
  readonly site_id: string;
  readonly share_url: string;
  readonly text: string;
  readonly card: ShareCardData;
  readonly svg: string;
}

export async function buildShareCard(siteId: string): Promise<ShareCardResult | null> {
  const site = await getSite(siteId);
  if (!site) return null;

  const reports = await listReportsBySite(siteId);
  const data: ShareCardData = {
    siteId: site.id,
    status: site.status,
    severity: site.severity,
    reportCount: Math.max(reports.length, site.backersCount),
    areaLabel: site.wardName ?? site.mla ?? "Verified civic report",
    beforePhotoUrl: reports[0]?.photo_url ?? null,
    afterPhotoUrl: site.afterPhotoUrl ?? null,
  };

  return {
    site_id: site.id,
    share_url: `/api/share/sites/${encodeURIComponent(site.id)}`,
    text: buildShareText(data),
    card: data,
    svg: buildShareCardSvg(data),
  };
}
