import { useState } from 'react';
import { BottomNav } from './components/layout/BottomNav';
import { Toast } from './components/ui/Toast';
import type { Tab } from './navigation';
import { AccountPage } from './pages/AccountPage';
import { ActivityPage } from './pages/ActivityPage';
import { AreasPage } from './pages/AreasPage';
import { CapturePanel } from './components/capture/CapturePanel';
import { MapPage } from './pages/MapPage';

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
        {tab === 'map' && <MapPage onNavigate={setTab} />}
        {tab === 'report' && <CapturePanel />}
        {tab === 'areas' && <AreasPage />}
        {tab === 'activity' && <ActivityPage />}
        {tab === 'account' && <AccountPage />}
      </main>

      <BottomNav active={tab} onChange={setTab} />
      <Toast />
    </div>
  );
}
