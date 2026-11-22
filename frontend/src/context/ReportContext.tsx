/**
 * ReportContext — shared store for report submission and instant reflection.
 *
 * The exact moment POST /api/v1/reports returns 201, the new report is
 * prepended to the activity feed AND applied to the map pins — no refetch,
 * no page reload. `focusReportId` drives the map fly-to + popup-open behaviour.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FeedReport, V1ReportResult } from '../types';

interface ReportContextValue {
  /** All verified reports (feed); newest first. */
  readonly reports: FeedReport[];
  /** The user's own reports, newest first — mirrors GET /api/v1/users/me/activity. */
  readonly myReports: FeedReport[];
  /** Report id the map should fly to and open a popup for. */
  readonly focusReportId: string | null;
  setFocusReportId: (id: string | null) => void;
  /** Site id whose complaint letter modal should open. */
  readonly complaintSiteId: string | null;
  setComplaintSiteId: (id: string | null) => void;
  /** True while the AI pipeline is processing a submission. */
  readonly submitting: boolean;
  /** Human-readable pipeline progress for the submit button. */
  readonly progressLabel: string | null;
  /**
   * Submits evidence through the v1 pipeline and applies the 201 response to
   * the map and the activity feed immediately, before any refetch completes.
   */
  submitReport: (input: {
    media: Blob;
    mediaType: 'photo' | 'video';
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
    notes: string;
  }) => Promise<V1ReportResult>;
  /** Re-syncs from GET /api/v1/sites + /reports/feed + /users/me/activity. */
  refresh: () => Promise<void>;
}

const ReportContext = createContext<ReportContextValue | null>(null);

const toList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      return [value];
    }
  }
  return [];
};

/** Shape of the backend 201 response (mirrors FeedReport + letter). */
export interface CreatedReport {
  id: string;
  report_id: string;
  site_id: string;
  status: string;
  site_status: string;
  report_count: number;
  grouped: boolean;
  media_type: 'photo' | 'video';
  trash_category: string;
  severity: number;
  detected_items: unknown;
  public_audit_summary: string;
  sanitized_media_url: string | null;
  thumbnail_url: string | null;
  pii_blur_count: number;
  captured_at: string;
  lat: number;
  lng: number;
  request_ip_masked: string;
  ulb_name: string | null;
  mla_constituency: string | null;
  mp_constituency: string | null;
}

export function ReportProvider({
  children,
  fetchFeed,
  fetchActivity,
  submit,
}: {
  children: ReactNode;
  /** Returns the verified public feed (GET /api/v1/reports/feed). */
  fetchFeed: () => Promise<readonly FeedReport[]>;
  /** Returns the signed-in user's activity (GET /api/v1/users/me/activity). */
  fetchActivity: () => Promise<readonly FeedReport[]>;
  /** Runs the authenticated v1 submission (POST /api/v1/reports). */
  submit: ReportContextValue['submitReport'];
}) {
  const [reports, setReports] = useState<FeedReport[]>([]);
  const [myReports, setMyReports] = useState<FeedReport[]>([]);
  const [focusReportId, setFocusReportId] = useState<string | null>(null);
  const [complaintSiteId, setComplaintSiteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  const mergeFeed = useCallback((incoming: readonly FeedReport[]) => {
    setReports((current) => {
      const merged = new Map<string, FeedReport>();
      for (const report of [...incoming, ...current]) {
        // Grouped reports share a site_id; keep the freshest capture per site.
        const key = report.site_id;
        const existing = merged.get(key);
        if (!existing || (report.captured_at ?? '') > (existing.captured_at ?? '')) {
          merged.set(key, report);
        }
      }
      return [...merged.values()].sort(
        (a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? ''),
      );
    });
  }, []);

  const refresh = useCallback(async () => {
    const [feed, mine] = await Promise.all([fetchFeed(), fetchActivity()]);
    for (const report of feed) knownIds.current.add(report.id);
    for (const report of mine) knownIds.current.add(report.id);
    mergeFeed(feed);
    setMyReports([...mine].sort(
      (a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? ''),
    ));
  }, [fetchFeed, fetchActivity, mergeFeed]);

  const submitReport = useCallback<ReportContextValue['submitReport']>(
    async (input) => {
      setSubmitting(true);
      setProgressLabel('AI is scanning for privacy (blurring faces/plates) & classifying trash…');
      try {
        const result = await submit(input);
        const created: FeedReport = {
          id: result.id,
          site_id: result.site_id,
          media_type: result.media_type,
          sanitized_media_url: result.sanitized_media_url,
          thumbnail_url: result.thumbnail_url,
          trash_category: result.trash_category,
          detected_items: toList(result.detected_items),
          severity: result.severity,
          pii_blur_count: result.pii_blur_count,
          public_audit_summary: result.public_audit_summary,
          lat: result.lat,
          lng: result.lng,
          captured_at: result.captured_at,
          request_ip_masked: result.request_ip_masked,
          status: result.status,
          site_status: result.site_status,
          report_count: result.report_count,
          grouped: result.grouped,
          ulb_name: result.ulb_name,
          mla_constituency: result.mla_constituency,
          mp_constituency: result.mp_constituency,
        };
        knownIds.current.add(created.id);
        // Instant reflection: map pin + activity card without a refetch.
        mergeFeed([created]);
        setMyReports((current) => [created, ...current]);
        setFocusReportId(created.id);
        return result;
      } finally {
        setSubmitting(false);
        setProgressLabel(null);
      }
    },
    [submit, mergeFeed],
  );

  const value = useMemo<ReportContextValue>(() => ({
    reports,
    myReports,
    focusReportId,
    setFocusReportId,
    complaintSiteId,
    setComplaintSiteId,
    submitting,
    progressLabel,
    submitReport,
    refresh,
  }), [reports, myReports, focusReportId, complaintSiteId, submitting, progressLabel, submitReport, refresh]);

  // Initial sync so the map and activity feed are populated on first paint.
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReports(): ReportContextValue {
  const context = useContext(ReportContext);
  if (!context) throw new Error('useReports must be used inside ReportProvider.');
  return context;
}
