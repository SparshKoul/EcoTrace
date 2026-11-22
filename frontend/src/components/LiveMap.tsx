/**
 * LiveMap — instant-reflection map fed by ReportContext.
 *
 * Pins come from `reports` (already includes a just-submitted report the moment
 * the 201 lands), and `focusReportId` triggers fly-to + popup open.
 */

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { PILOT_CENTRE, TILE_ATTRIBUTION, TILE_URL } from '../config/rules';
import { useReports } from '../context/ReportContext';
import type { GeoPoint } from '../types';

interface Props {
  readonly userPoint: GeoPoint | null;
  readonly onViewComplaint: (siteId: string) => void;
}

function FocusController({
  focusReportId, userPoint, reports, markers,
}: {
  focusReportId: string | null;
  userPoint: GeoPoint | null;
  reports: ReturnType<typeof useReports>['reports'];
  markers: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (userPoint) map.flyTo([userPoint.lat, userPoint.lng], Math.max(map.getZoom(), 14), { duration: 0.7 });
  }, [map, userPoint]);

  useEffect(() => {
    if (!focusReportId) return;
    // A focused id may be a report id or a site id; resolve to coordinates.
    const focused = reports.find((report) => report.id === focusReportId || report.site_id === focusReportId);
    if (!focused) return;
    map.flyTo([focused.lat, focused.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    const marker = markers.current?.get(focused.site_id);
    window.setTimeout(() => marker?.openPopup(), 850);
  }, [map, focusReportId, reports, markers]);

  return null;
}

const severityColour = (severity: number) =>
  severity >= 4 ? '#b3261e' : severity === 3 ? '#e37400' : '#0b7a73';

export function LiveMap({ userPoint, onViewComplaint }: Props) {
  const { reports, focusReportId, setFocusReportId } = useReports();
  const markers = useRef<Map<string, L.Marker>>(new Map());

  const sites = useMemo(() => {
    const grouped = new Map<string, typeof reports[number]>();
    for (const report of reports) {
      const current = grouped.get(report.site_id);
      if (!current || (report.captured_at ?? '') > (current.captured_at ?? '')) grouped.set(report.site_id, report);
    }
    return [...grouped.values()];
  }, [reports]);

  return (
    <MapContainer center={[PILOT_CENTRE.lat, PILOT_CENTRE.lng]} zoom={13} className="h-full w-full">
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <FocusController
        focusReportId={focusReportId}
        userPoint={userPoint}
        reports={reports}
        markers={markers}
      />
      {userPoint && (
        <CircleMarker
          center={[userPoint.lat, userPoint.lng]}
          radius={9}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1967d2', fillOpacity: 1 }}
        >
          <Popup>You are here</Popup>
        </CircleMarker>
      )}
      {sites.map((report) => {
        const icon = L.divIcon({
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          html: `<div class="eco-pin" style="width:40px;height:40px;background:${severityColour(report.severity)}">${report.severity}</div>`,
        });
        const items = Array.isArray(report.detected_items)
          ? report.detected_items.join(', ')
          : String(report.detected_items ?? '');
        return (
          <Marker
            key={report.site_id}
            position={[report.lat, report.lng]}
            icon={icon}
            eventHandlers={{
              click: () => setFocusReportId(report.id),
            }}
          >
            <Popup minWidth={260}>
              <div className="space-y-2 text-ink">
                {report.media_type === 'video' && report.sanitized_media_url ? (
                  <video controls className="h-36 w-full rounded-xl bg-ink" src={report.sanitized_media_url} />
                ) : report.sanitized_media_url ? (
                  <img alt="Sanitized evidence" className="h-36 w-full rounded-xl object-cover" src={report.sanitized_media_url} />
                ) : null}
                <p className="rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
                  🔒 {report.pii_blur_count} sensitive items blurred (faces/plates)
                </p>
                <p className="text-sm font-bold capitalize">{report.trash_category?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted">Detected: {items || '—'}</p>
                <p className="text-xs text-muted">Severity {report.severity}/5 · Status {report.site_status}</p>
                <div className="rounded-xl bg-tile p-2 text-[11px] text-muted">
                  <p>Captured at: {report.captured_at ? new Date(report.captured_at).toLocaleString() : '—'}</p>
                  <p>GPS: {report.lat.toFixed(5)}, {report.lng.toFixed(5)}</p>
                  <p>Origin IP: {report.request_ip_masked ?? 'masked'}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
                  onClick={() => onViewComplaint(siteIdOf(report))}
                >
                  View legal complaint
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

const siteIdOf = (report: { site_id: string }): string => report.site_id;
