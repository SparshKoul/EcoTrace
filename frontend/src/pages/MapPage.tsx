import { useState } from 'react';
import { CaptureModal } from '../components/capture/CaptureModal';
import { ComplaintModal } from '../components/complaint/ComplaintModal';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { GpsBadge } from '../components/ui/GpsBadge';
import { PILOT_CENTRE } from '../config/rules';
import type { Tab } from '../navigation';
import { useApp } from '../state/AppContext';
import type { GeoPoint } from '../types';
import { TransparencyMap } from './TransparencyMap';

export function MapPage({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { feed, lastReport, focusReport, locate, notify } = useApp();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [complaintSite, setComplaintSite] = useState<string | null>(null);
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);

  const useMyLocation = async () => {
    const result = await locate();
    if (result.fix) {
      setUserPoint({ lat: result.fix.lat, lng: result.fix.lng });
      notify(`Map centred on your location (±${Math.round(result.fix.accuracyM)} m).`);
    } else {
      notify(result.error ?? 'Location unavailable.');
    }
  };

  return (
    <section className="relative h-full" aria-label="Live civic waste map">
      <TransparencyMap
        reports={feed}
        focus={focusReport ?? lastReport}
        userPoint={userPoint}
        onOpenComplaint={setComplaintSite}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <GpsBadge />
          <Chip tone="accent">{feed.length} verified reports</Chip>
          <button
            type="button"
            onClick={() => void useMyLocation()}
            className="rounded-full border-2 border-ink bg-surface px-3 py-1 text-xs font-bold"
          >
            ◎ My location
          </button>
        </div>
        <p className="pointer-events-auto max-w-md rounded-2xl border border-line bg-surface/95 px-3 py-2 text-xs text-muted">
          Showing verified reports near Chitkara University ({PILOT_CENTRE.lat.toFixed(2)}, {PILOT_CENTRE.lng.toFixed(2)}).
          Faces, plates and personal text are blurred before publication.
        </p>
      </div>

      <div className="absolute bottom-20 right-4 flex gap-2">
        <Button variant="outline" onClick={() => onNavigate('activity')}>My Activity</Button>
        <Button variant="sun" onClick={() => setCaptureOpen(true)}>＋ Capture</Button>
      </div>

      {captureOpen && (
        <CaptureModal
          onClose={() => setCaptureOpen(false)}
          onCreated={(report) => {
            notify(report.grouped ? 'Merged into a nearby site.' : 'New site published.');
            onNavigate('map');
          }}
        />
      )}

      {complaintSite && (
        <ComplaintModal siteId={complaintSite} onClose={() => setComplaintSite(null)} />
      )}
    </section>
  );
}
