import { lazy, Suspense, useState } from 'react';
import { BottomNav } from './components/layout/BottomNav';
import { Toast } from './components/ui/Toast';
import type { Tab } from './navigation';

// Pages are lazily loaded so heavy dependencies (leaflet, jspdf) are code-split
// and only downloaded when the user opens the relevant tab.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const CapturePanel = lazy(() => import('./components/capture/CapturePanel').then((m) => ({ default: m.CapturePanel })));
const AreasPage = lazy(() => import('./pages/AreasPage').then((m) => ({ default: m.AreasPage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));

export default function App() {
  const [tab, setTab] = useState<Tab>('map');

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-ink bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl border-2 border-ink bg-sun text-lg" aria-hidden="true">◎</div>
          <div>
            <p className="font-display text-xl leading-none font-bold">EcoTrace</p>
            <p className="text-[10px] font-semibold tracking-wide text-muted">CIVIC WASTE ACTION</p>
          </div>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-[11px] font-bold text-accent">SWM Rules, 2026</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center p-8">
              <div className="flex flex-col items-center gap-3 text-muted">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" aria-hidden="true" />
                <p className="text-sm font-semibold">Loading…</p>
              </div>
            </div>
          }
        >
          {tab === 'map' && <MapPage onNavigate={setTab} />}
          {tab === 'report' && <CapturePanel onNavigate={setTab} />}
          {tab === 'areas' && <AreasPage />}
          {tab === 'activity' && <ActivityPage onNavigate={setTab} />}
          {tab === 'account' && <AccountPage />}
        </Suspense>
      </main>

      <BottomNav active={tab} onChange={setTab} />
      <Toast />
    </div>
  );
}
