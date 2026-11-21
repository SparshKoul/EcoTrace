/** Live transparency map built from the verified v1 report feed. */

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { PILOT_CENTRE, TILE_ATTRIBUTION, TILE_URL } from '../config/rules';
import type { FeedReport, GeoPoint } from '../types';

interface Props {
  readonly reports: readonly FeedReport[];
  readonly focus: FeedReport | null;
  readonly userPoint: GeoPoint | null;
  readonly onOpenComplaint: (siteId: string) => void;
}

function FocusController({
  focus, userPoint, markers,
}: {
  focus: FeedReport | null;
  userPoint: GeoPoint | null;
  markers: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (userPoint) map.flyTo([userPoint.lat, userPoint.lng], Math.max(map.getZoom(), 14), { duration: 0.7 });
  }, [map, userPoint]);

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    const marker = markers.current?.get(focus.site_id);
    window.setTimeout(() => marker?.openPopup(), 850);
  }, [map, focus, markers]);
  return null;
}

const severityColour = (severity: number) =>
  severity >= 4 ? '#b3261e' : severity === 3 ? '#e37400' : '#0b7a73';

export function TransparencyMap({ reports, focus, userPoint, onOpenComplaint }: Props) {
  const markers = useRef<Map<string, L.Marker>>(new Map());

  const sites = useMemo(() => {
    const grouped = new Map<string, FeedReport>();
    for (const report of reports) {
      const current = grouped.get(report.site_id);
      if (!current || (report.captured_at ?? '') > (current.captured_at ?? '')) grouped.set(report.site_id, report);
    }
    return [...grouped.values()];
  }, [reports]);

  return (
    <MapContainer center={[PILOT_CENTRE.lat, PILOT_CENTRE.lng]} zoom={13} className="h-full w-full">
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <FocusController focus={focus} userPoint={userPoint} markers={markers} />
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
            ref={(marker) => {
              if (marker) markers.current.set(report.site_id, marker);
              else markers.current.delete(report.site_id);
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
                  🔒 {report.pii_blur_count} sensitive items blurred
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
                  onClick={() => onOpenComplaint(report.site_id)}
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
