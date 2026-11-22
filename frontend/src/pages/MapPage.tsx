import { useState } from 'react';
import { LocalityPanel } from '../components/areas/Scorecard';
import { CaptureModal } from '../components/capture/CaptureModal';
import { ComplaintModal } from '../components/complaint/ComplaintModal';
import { SiteMap } from '../components/map/SiteMap';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { GpsBadge } from '../components/ui/GpsBadge';
import { PILOT_CENTRE } from '../config/rules';
import type { Tab } from '../navigation';
import { useApp } from '../state/AppContext';
import type { GeoPoint, Site } from '../types';

export function MapPage({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { sites, areas, feed, locate, notify, backExistingSite } = useApp();
  const [complaintSiteId, setComplaintSiteId] = useState<string | null>(null);
  const [localitySite, setLocalitySite] = useState<Site | null>(null);
  const [focusPoint, setFocusPoint] = useState<GeoPoint | null>(null);
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);

  const useMyLocation = async () => {
    const result = await locate();
    if (result.fix) {
      const point = { lat: result.fix.lat, lng: result.fix.lng };
      setUserPoint(point);
      setFocusPoint(point);
      notify(`Map centred on your location (±${Math.round(result.fix.accuracyM)} m).`);
    } else {
      notify(result.error ?? 'Location unavailable.');
    }
  };

  return (
    <section className="relative h-full" aria-label="Civic waste map">
      <SiteMap
        sites={sites}
        onOpenComplaint={setComplaintSiteId}
        onOpenScores={setLocalitySite}
        onBackSite={backExistingSite}
        focusPoint={focusPoint}
        userPoint={userPoint}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <GpsBadge />
          <Chip tone="accent">{sites.length || feed.length} verified reports</Chip>
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

      {complaintSiteId && (
        <ComplaintModal siteId={complaintSiteId} onClose={() => setComplaintSiteId(null)} />
      )}

      {localitySite && (
        <div className="fixed inset-0 z-[1050] flex items-end justify-center bg-ink/50 sm:items-center" onMouseDown={() => setLocalitySite(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="locality-title"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-sheet bg-surface p-5 sm:rounded-sheet"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="eco-label">Locality accountability</p>
                <h2 id="locality-title" className="font-display text-2xl font-bold">Three-pillar scorecard</h2>
              </div>
              <Button variant="quiet" aria-label="Close scorecard" onClick={() => setLocalitySite(null)}>✕</Button>
            </div>
            <LocalityPanel site={localitySite} areas={areas} />
          </div>
        </div>
      )}
    </section>
  );
}
