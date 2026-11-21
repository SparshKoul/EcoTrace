/**
 * In-memory fallback for Phase 3 when PostgreSQL is not running (local hackathon mode).
 * The Postgres repository is authoritative when available; this store keeps the API usable offline.
 */

export interface StoredSite {
  readonly id: string;
  readonly status: string;
  readonly cleanupStatus: string;
  readonly verification: string;
  readonly severity: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly wasteType: string;
  readonly wardName?: string;
  readonly mla?: string;
  readonly mp?: string;
  readonly backersCount: number;
  readonly afterPhotoUrl?: string | null;
  readonly firstReportedAt: string;
  readonly lastActivityAt: string;
}

export interface CleanupClaimRecord {
  readonly id: string;
  readonly site_id: string;
  readonly after_photo_url: string;
  readonly uploader_id: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly distance_m?: number;
  readonly status: "checking" | "accepted" | "rejected";
  readonly ai_confidence?: number;
  readonly reason?: string;
  readonly created_at: string;
  readonly validated_at?: string;
}

export interface BackerRecord {
  readonly site_id: string;
  readonly user_id: string;
  readonly created_at: string;
}

const sites = new Map<string, StoredSite>();
const claims = new Map<string, CleanupClaimRecord>();
const backers = new Map<string, BackerRecord>();
const letters = new Map<string, { id: string; site_id: string; document: unknown; created_at: string }>();

const DEMO_SITE_ID = "site_demo_chitkara";

export function seedDemoSite(): void {
  if (sites.has(DEMO_SITE_ID)) return;
  const now = new Date().toISOString();
  sites.set(DEMO_SITE_ID, {
    id: DEMO_SITE_ID,
    status: "open",
    cleanupStatus: "none",
    verification: "unverified",
    severity: 65,
    latitude: 30.5157,
    longitude: 76.6592,
    wasteType: "mixed",
    wardName: "Rajpura Municipal Council",
    mla: "Rajpura Assembly Constituency",
    mp: "Patiala Parliamentary Constituency",
    backersCount: 0,
    afterPhotoUrl: null,
    firstReportedAt: now,
    lastActivityAt: now,
  });
}

seedDemoSite();

export const memory = {
  getSite(id: string): StoredSite | undefined {
    return sites.get(id);
  },
  saveSite(site: StoredSite): void {
    sites.set(site.id, site);
  },
  saveClaim(claim: CleanupClaimRecord): void {
    claims.set(claim.id, claim);
  },
  getClaim(id: string): CleanupClaimRecord | undefined {
    return claims.get(id);
  },
  listClaims(siteId: string): CleanupClaimRecord[] {
    return [...claims.values()].filter((claim) => claim.site_id === siteId);
  },
  listAllClaims(): CleanupClaimRecord[] {
    return [...claims.values()];
  },
  addBacker(record: BackerRecord): boolean {
    const key = `${record.site_id}:${record.user_id}`;
    if (backers.has(key)) return false;
    backers.set(key, record);
    return true;
  },
  listBackers(siteId: string): BackerRecord[] {
    return [...backers.values()].filter((record) => record.site_id === siteId);
  },
  saveLetter(letter: { id: string; site_id: string; document: unknown; created_at: string }): void {
    letters.set(letter.id, letter);
  },
  getLetterBySite(siteId: string): { document: unknown } | undefined {
    return [...letters.values()].reverse().find((letter) => letter.site_id === siteId);
  },
};

export const DEMO_SITE = DEMO_SITE_ID;
