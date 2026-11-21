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
import { fetchActivity, fetchAreas, fetchSites, submitReport } from '../services/api';
import type { ActivityItem, Area, ReportReceipt, ReportSubmission, Site } from '../types';

interface AppContextValue {
  readonly sites: Site[];
  readonly areas: Area[];
  readonly activity: ActivityItem[];
  readonly loading: boolean;
  readonly fix: ReturnType<typeof useGps>['fix'];
  readonly gpsDenied: boolean;
  readonly gpsLoading: boolean;
  readonly locate: ReturnType<typeof useGps>['locate'];
  readonly online: boolean;
  readonly signedIn: boolean;
  readonly toast: string | null;
  setSignedIn: (value: boolean) => void;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  sendReport: (submission: ReportSubmission) => Promise<ReportReceipt>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const gps = useGps();
  const [sites, setSites] = useState<Site[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [signedIn, setSignedIn] = useState(true);
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

  const refresh = useCallback(async () => {
    try {
      const [nextSites, nextAreas, nextActivity] = await Promise.all([
        fetchSites(), fetchAreas(), fetchActivity(),
      ]);
      setSites(nextSites);
      setAreas(nextAreas);
      setActivity(nextActivity);
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

  const sendReport = useCallback(async (submission: ReportSubmission) => {
    const receipt = await submitReport(submission);
    await refresh();
    return receipt;
  }, [refresh]);

  const value = useMemo<AppContextValue>(() => ({
    sites, areas, activity, loading,
    fix: gps.fix, gpsDenied: gps.denied, gpsLoading: gps.loading, locate: gps.locate,
    online, signedIn, toast, setSignedIn, notify, refresh, sendReport,
  }), [sites, areas, activity, loading, gps.fix, gps.denied, gps.loading, gps.locate, online, signedIn, toast, notify, refresh, sendReport]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
