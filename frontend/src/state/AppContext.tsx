import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useGps } from '../hooks/useGps';
import {
  addSiteNote, backSite, fetchActivity, fetchAreas, fetchSites, fetchV1Activity, fetchV1Feed, fetchV1Sites,
  submitReport, submitV1Report, voteSite,
} from '../services/api';
import { getMe, signIn, signOut, signUp, type AuthUser } from '../services/auth';
import type {
  ActivityItem, ActivityResponse, Area, FeedReport, ReportReceipt, ReportSubmission,
  Site, V1ReportResult, V1Site,
} from '../types';

interface AppContextValue {
  readonly sites: Site[];
  readonly areas: Area[];
  readonly activity: ActivityItem[];
  readonly v1Sites: V1Site[];
  readonly feed: FeedReport[];
  readonly activityV1: ActivityResponse | null;
  readonly lastReport: V1ReportResult | null;
  readonly focusReport: FeedReport | null;
  setFocusReport: (report: FeedReport | null) => void;
  readonly loading: boolean;
  readonly fix: ReturnType<typeof useGps>['fix'];
  readonly gpsDenied: boolean;
  readonly gpsLoading: boolean;
  readonly locate: ReturnType<typeof useGps>['locate'];
  readonly locateByIp: ReturnType<typeof useGps>['locateByIp'];
  readonly online: boolean;
  readonly user: AuthUser | null;
  readonly signedIn: boolean;
  readonly authLoading: boolean;
  readonly toast: string | null;
  signInUser: (email: string, password: string) => Promise<void>;
  signUpUser: (email: string, password: string, fullName?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  sendReport: (submission: ReportSubmission) => Promise<ReportReceipt>;
  backExistingSite: (siteId: string) => Promise<void>;
  voteOnSite: (siteId: string, vote: 'confirm' | 'reject' | 'cleaned') => Promise<void>;
  addNoteToSite: (siteId: string, content: string) => Promise<void>;
  sendV1Report: (input: {
    media: Blob;
    mediaType: 'photo' | 'video';
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
    notes: string;
  }) => Promise<V1ReportResult>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const gps = useGps();
  const [sites, setSites] = useState<Site[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [v1Sites, setV1Sites] = useState<V1Site[]>([]);
  const [feed, setFeed] = useState<FeedReport[]>([]);
  const [activityV1, setActivityV1] = useState<ActivityResponse | null>(null);
  const [lastReport, setLastReport] = useState<V1ReportResult | null>(null);
  const [focusReport, setFocusReport] = useState<FeedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    getMe()
      .then((restored) => { if (active) setUser(restored); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextSites, nextAreas, nextActivity, nextV1Sites, nextFeed, nextActivityV1] = await Promise.all([
        fetchSites(), fetchAreas(), fetchActivity(), fetchV1Sites(), fetchV1Feed(), fetchV1Activity(),
      ]);
      setSites(nextSites);
      setAreas(nextAreas);
      setActivity(nextActivity);
      setV1Sites(nextV1Sites);
      setFeed(nextFeed);
      setActivityV1(nextActivityV1);
    } catch {
      setToast('Could not refresh civic data. Showing the last known view.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 5_000);
  }, []);

  const signInUser = useCallback(async (email: string, password: string) => {
    const result = await signIn(email, password);
    setUser(result);
    notify(`Signed in as ${result.email}.`);
    await refresh();
  }, [notify, refresh]);

  const signUpUser = useCallback(async (email: string, password: string, fullName?: string) => {
    const result = await signUp(email, password, fullName);
    setUser(result);
    notify(`Account created for ${result.email}.`);
    await refresh();
  }, [notify, refresh]);

  const signOutUser = useCallback(async () => {
    await signOut();
    setUser(null);
    notify('Signed out.');
  }, [notify]);

  const sendReport = useCallback(async (submission: ReportSubmission) => {
    const receipt = await submitReport(submission);
    await refresh();
    return receipt;
  }, [refresh]);

  const backExistingSite = useCallback(async (siteId: string) => {
    try {
      const result = await backSite(siteId, user?.id);
      notify(
        result.just_verified
          ? 'Site reached 10 backers and is now VERIFIED!'
          : `Backed site! Total backers: ${result.count} (${result.needed} needed for quorum).`
      );
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Could not back this site.');
    }
  }, [user?.id, notify, refresh]);

  const voteOnSite = useCallback(async (siteId: string, vote: 'confirm' | 'reject' | 'cleaned') => {
    if (!gps.fix) {
      notify('Location required to cast a verification vote.');
      return;
    }
    try {
      await voteSite(siteId, vote, gps.fix.lat, gps.fix.lng, user?.id);
      notify(`Vote recorded: ${vote}.`);
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Could not cast vote.');
    }
  }, [gps.fix, user?.id, notify, refresh]);

  const addNoteToSite = useCallback(async (siteId: string, content: string) => {
    try {
      await addSiteNote(siteId, content, user?.id);
      notify('Note added to site.');
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Could not add note.');
    }
  }, [user?.id, notify, refresh]);

  const sendV1Report = useCallback(async (input: {
    media: Blob;
    mediaType: 'photo' | 'video';
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
    notes: string;
  }) => {
    const result = await submitV1Report(input);
    setLastReport(result);
    setFocusReport(result);

    // Optimistically reflect the site on the map immediately
    const optimisticSite: Site = {
      id: result.site_id,
      lat: result.lat,
      lng: result.lng,
      type: (['dump', 'construction', 'water', 'overflowing_bin', 'no_bin'].includes(result.trash_category)
        ? result.trash_category : 'dump') as Site['type'],
      wasteStream: 'mixed',
      severity: Number(result.severity || 60),
      status: 'open',
      reportCount: Number(result.report_count || 1),
      reporterCount: Number(result.report_count || 1),
      nearBin: false,
      evidenceUrl: result.sanitized_media_url || result.thumbnail_url,
      boundary: { ulb: result.ulb_name ?? null, mla: result.mla_constituency ?? null, mp: result.mp_constituency ?? null },
      createdAt: result.captured_at || new Date().toISOString(),
      updatedAt: result.captured_at || new Date().toISOString(),
    };

    setSites((current) => {
      const idx = current.findIndex((s) => s.id === result.site_id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = {
          ...next[idx]!,
          reportCount: (next[idx]!.reportCount || 0) + 1,
          reporterCount: (next[idx]!.reporterCount || 0) + 1,
          evidenceUrl: result.sanitized_media_url || result.thumbnail_url || next[idx]!.evidenceUrl,
          updatedAt: result.captured_at || new Date().toISOString(),
        };
        return next;
      }
      return [optimisticSite, ...current];
    });

    setFeed((current) => [result, ...current.filter((r) => r.id !== result.id)]);

    setActivityV1((current) => current ? {
      ...current,
      summary: {
        ...current.summary,
        total_reports: current.summary.total_reports + 1,
        active_sites: current.summary.active_sites + 1,
      },
      activity: [result, ...current.activity.filter((r) => r.id !== result.id)],
    } : {
      user_id: user?.id ?? '',
      summary: { total_reports: 1, pii_protected: 1, active_sites: 1, cleaned_sites: 0 },
      activity: [result],
    });

    notify(result.grouped ? 'Report merged into an existing nearby site.' : 'New site published to the map.');
    void refresh();
    return result;
  }, [user?.id, refresh, notify]);

  const value = useMemo<AppContextValue>(() => ({
    sites, areas, activity, v1Sites, feed, activityV1, lastReport, focusReport, setFocusReport, loading,
    fix: gps.fix, gpsDenied: gps.denied, gpsLoading: gps.loading,
    locate: gps.locate, locateByIp: gps.locateByIp,
    online, user, signedIn: user !== null, authLoading, toast,
    signInUser, signUpUser, signOutUser, notify, refresh, sendReport, sendV1Report,
    backExistingSite, voteOnSite, addNoteToSite,
  }), [sites, areas, activity, v1Sites, feed, activityV1, lastReport, focusReport, setFocusReport, loading,
    gps.fix, gps.denied, gps.loading, gps.locate, gps.locateByIp, online, user,
    authLoading, toast, signInUser, signUpUser, signOutUser, notify, refresh,
    sendReport, sendV1Report, backExistingSite, voteOnSite, addNoteToSite]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
