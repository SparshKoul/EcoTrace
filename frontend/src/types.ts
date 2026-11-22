/** Shared frontend domain types. Mirrors the API contract without importing backend code. */

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface GpsFix extends GeoPoint {
  /** Horizontal accuracy in metres. EcoTrace only accepts fixes at or below GPS_MAX_ACCURACY_M. */
  readonly accuracyM: number;
  /** Epoch milliseconds from the device's PositionTimestamp. */
  readonly timestamp: number;
}

export type ReportType = 'dump' | 'no_bin' | 'water' | 'construction' | 'overflowing_bin';

export type WasteStream = 'plastic' | 'organic' | 'construction' | 'mixed' | 'hazardous' | 'none';

export type SiteStatus = 'open' | 'verified' | 'cleared' | 'reopened' | 'closed';

export interface CivicBoundary {
  readonly ulb: string | null;
  readonly mla: string | null;
  readonly mp: string | null;
}

export interface Site extends GeoPoint {
  readonly id: string;
  readonly type: ReportType;
  readonly wasteStream: WasteStream;
  /** 0-100, set by the microservice and verified by the backend. */
  readonly severity: number;
  readonly status: SiteStatus;
  readonly reportCount: number;
  readonly reporterCount: number;
  /** True when a dustbin exists within the service radius, so dumping is a citizen action, not a deficit. */
  readonly nearBin: boolean;
  /** Sanitized, public-bucket image URL. Raw media never reaches the client. */
  readonly evidenceUrl: string | null;
  readonly boundary: CivicBoundary;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AreaScores {
  /** Resolved vs persistent/reopened sites. */
  readonly clearing: number;
  /** Illegal dumping despite nearby dustbins. */
  readonly citizenDumping: number;
  /** Density of "no dustbin within 1 km" reports. */
  readonly binAccess: number;
}

export interface Area extends CivicBoundary {
  readonly id: string;
  readonly name: string;
  readonly reporterCount: number;
  readonly siteCount: number;
  readonly scores: AreaScores | null;
}

/** Payload accepted by POST /api/v1/reports. */
export interface ReportSubmission {
  readonly type: ReportType;
  readonly mode: 'photo' | 'walking';
  readonly location: GpsFix;
  readonly note: string;
  readonly media: readonly Blob[];
}

export interface ReportReceipt {
  readonly report_id: string;
  readonly status: 'PROCESSING';
}

export interface ActivityItem {
  readonly id: string;
  readonly type: ReportType;
  readonly status: SiteStatus | 'PROCESSING' | 'REJECTED';
  readonly location?: GpsFix;
  readonly createdAt: string;
  readonly detail: string;
}

/** Response schema for POST /internal/analyze-evidence (owned by the microservice). */
export interface EvidenceAnalysis {
  readonly is_waste: boolean;
  readonly confidence: number;
  readonly waste_stream: WasteStream;
  readonly severity: number;
  readonly pii_blurred: boolean;
  readonly sanitized_image_url: string | null;
  readonly reject_reason: string | null;
  readonly citations: readonly string[];
}

export interface V1Site {
  readonly id: string;
  readonly status: string;
  readonly trash_category: string;
  readonly severity_score: number;
  readonly report_count: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly cover_media_url: string | null;
  readonly media_type: 'photo' | 'video';
  readonly ulb_name: string | null;
  readonly mla_constituency: string | null;
  readonly mp_constituency: string | null;
  readonly captured_at?: string;
  readonly request_ip_masked?: string;
  readonly pii_blur_count?: number;
  readonly detected_items?: string[] | string;
  readonly updated_at: string;
}

export interface FeedReport {
  readonly id: string;
  readonly report_id?: string;
  readonly site_id: string;
  readonly media_type: 'photo' | 'video';
  readonly sanitized_media_url: string | null;
  readonly thumbnail_url: string | null;
  readonly trash_category: string;
  readonly detected_items: string[] | string;
  readonly severity: number;
  readonly pii_blur_count: number;
  readonly public_audit_summary: string;
  readonly lat: number;
  readonly lng: number;
  readonly captured_at: string | null;
  readonly request_ip_masked: string | null;
  readonly status: string;
  readonly site_status: string;
  readonly report_count: number;
  readonly grouped?: boolean;
  readonly ulb_name: string | null;
  readonly mla_constituency: string | null;
  readonly mp_constituency: string | null;
}

export interface ActivityResponse {
  readonly user_id: string;
  readonly summary: {
    readonly total_reports: number;
    readonly pii_protected: number;
    readonly active_sites: number;
    readonly cleaned_sites: number;
  };
  readonly activity: readonly FeedReport[];
}

export interface V1ReportResult extends FeedReport {
  readonly grouped: boolean;
  readonly captured_at: string;
  readonly letter: ComplaintLetter;
  readonly thumbnail_url: string | null;
}

export interface ComplaintLetter {
  readonly siteId: string;
  readonly recipient: string;
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
  /** Every quoted rule has passed the backend's exact-substring check. */
  readonly citations: readonly string[];
  readonly generatedAt: string;
}
