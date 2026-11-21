import { useState } from 'react';
import { LocalityPanel } from '../components/areas/Scorecard';
import { ComplaintModal } from '../components/complaint/ComplaintModal';
import { SiteMap } from '../components/map/SiteMap';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { GpsBadge } from '../components/ui/GpsBadge';
import { PILOT_CENTRE, RULES, TYPE_COLOR, TYPE_LABEL } from '../config/rules';
import type { Tab } from '../navigation';
import { useApp } from '../state/AppContext';
import type { GeoPoint, Site } from '../types';

export function MapPage({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { sites, areas, loading, locate, notify } = useApp();
  const [complaintSiteId, setComplaintSiteId] = useState<string | null>(null);
  const [localitySite, setLocalitySite] = useState<Site | null>(null);
  const [focusPoint, setFocusPoint] = useState<GeoPoint | null>(null);
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [askForLocation, setAskForLocation] = useState(true);

  const useMyLocation = async () => {
    setLocating(true);
    const result = await locate();
    setLocating(false);
    if (result) {
      const point = { lat: result.lat, lng: result.lng };
      setUserPoint(point);
      setFocusPoint(point);
      setAskForLocation(false);
      notify(`Map centred on your location (±${Math.round(result.accuracyM)} m).`);
    } else {
      notify('Location unavailable. Allow location access in your browser, then try again.');
    }
  };

  return (
    <section className="relative h-full" aria-label="Civic waste map">
      <SiteMap
        sites={sites}
        onOpenComplaint={setComplaintSiteId}
        onOpenScores={setLocalitySite}
        focusPoint={focusPoint}
        userPoint={userPoint}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <GpsBadge />
          <Chip tone="accent">{sites.length} sites on map</Chip>
          <button
            type="button"
            onClick={() => void useMyLocation()}
            disabled={locating}
            className="rounded-full border-2 border-ink bg-surface px-3 py-1 text-xs font-bold disabled:opacity-50"
          >
            {locating ? 'Locating…' : '◎ My location'}
          </button>
        </div>
        <p className="pointer-events-auto max-w-md rounded-2xl border border-line bg-surface/95 px-3 py-2 text-xs text-muted">
          Starting at Chitkara University ({PILOT_CENTRE.lat.toFixed(2)}, {PILOT_CENTRE.lng.toFixed(2)}). Pins show
          severity (0–100); colours show report type. Sites merge within {RULES.SITE_MERGE_RADIUS_M} m.
        </p>
      </div>

      {askForLocation && (
        <div className="pointer-events-auto absolute inset-x-4 top-36 z-[900] mx-auto max-w-md rounded-2xl border-2 border-ink bg-surface p-4 shadow-[0_4px_0_#221c15]">
          <p className="font-display text-lg font-bold">See sites near you?</p>
          <p className="mt-1 text-sm text-muted">
            We'll ask your device for its current location and centre the map there. You can stay on the Chitkara
            University view instead.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="sun" onClick={() => void useMyLocation()} disabled={locating}>
              {locating ? 'Locating…' : 'Use my current location'}
            </Button>
            <Button variant="outline" onClick={() => setAskForLocation(false)}>Not now</Button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-2 shadow-md">
          {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((key) => (
            <span key={key} className="flex items-center gap-1 text-[11px] font-semibold text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[key] }} />
              {TYPE_LABEL[key]}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute bottom-20 right-4">
        <Button variant="sun" onClick={() => onNavigate('report')}>＋ Report</Button>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-page/60">
          <Chip tone="neutral">Loading verified sites…</Chip>
        </div>
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
