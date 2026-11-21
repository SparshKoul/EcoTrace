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
import { getMe, signIn, signOut, signUp, type AuthUser } from '../services/auth';
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
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const gps = useGps();
  const [sites, setSites] = useState<Site[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
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

  const value = useMemo<AppContextValue>(() => ({
    sites, areas, activity, loading,
    fix: gps.fix, gpsDenied: gps.denied, gpsLoading: gps.loading,
    locate: gps.locate, locateByIp: gps.locateByIp,
    online, user, signedIn: user !== null, authLoading, toast,
    signInUser, signUpUser, signOutUser, notify, refresh, sendReport,
  }), [sites, areas, activity, loading, gps.fix, gps.denied, gps.loading,
    gps.locate, gps.locateByIp, online, user, authLoading, toast,
    signInUser, signUpUser, signOutUser, notify, refresh, sendReport]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
