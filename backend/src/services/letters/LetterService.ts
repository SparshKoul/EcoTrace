/** Phase 3.2 / 3.3 — cached, citation-verified complaint letters. */

import { getLetterBySite, getSite, saveLetter } from "../sites/phase3Repository.js";
import { draftLetter, type LetterDraft } from "./LetterDrafter.js";

export async function getOrCreateLetter(siteId: string): Promise<LetterDraft | null> {
  const cached = await getLetterBySite(siteId);
  if (cached && typeof cached === "object") return cached as LetterDraft;

  const site = await getSite(siteId);
  if (!site) return null;

  const letter = draftLetter({
    id: site.id,
    wasteType: site.wasteType,
    latitude: site.latitude,
    longitude: site.longitude,
    status: site.status,
    severity: site.severity,
    backers_count: site.backersCount,
    first_reported_at: site.firstReportedAt,
    ward_name: site.wardName,
    mla_constituency: site.mla,
    mp_constituency: site.mp,
    photoUrl: site.afterPhotoUrl ?? undefined,
  });

  await saveLetter({
    id: letter.letter_id,
    site_id: site.id,
    document: letter,
    created_at: letter.created_at,
  });
  return letter;
}
