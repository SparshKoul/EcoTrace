import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { PILOT_CENTRE, TILE_ATTRIBUTION, TILE_URL, TYPE_COLOR, TYPE_LABEL } from '../../config/rules';
import { clusterKey } from '../../domain/geo';
import type { GeoPoint, Site } from '../../types';
import { Chip } from '../ui/Chip';

interface SiteMapProps {
  readonly sites: readonly Site[];
  readonly onOpenComplaint: (siteId: string) => void;
  readonly onOpenScores: (site: Site) => void;
  readonly onBackSite?: (siteId: string) => void;
  /** When set, the map flies here — used after the citizen shares their live location. */
  readonly focusPoint: GeoPoint | null;
  /** The citizen's last known position, drawn as a blue user dot. */
  readonly userPoint: GeoPoint | null;
}

function MapBridge({ onReady, onZoom }: { onReady: (map: L.Map) => void; onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

interface Cluster {
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
  readonly sites: readonly Site[];
}

export function SiteMap({ sites, onOpenComplaint, onOpenScores, onBackSite, focusPoint, userPoint }: SiteMapProps) {
  const [zoom, setZoom] = useState(12);
  const [map, setMap] = useState<L.Map | null>(null);

  const onReady = useCallback((instance: L.Map) => setMap(instance), []);

  useEffect(() => {
    if (map && focusPoint) {
      map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [map, focusPoint]);

  const clusters = useMemo<Cluster[]>(() => {
    const groups = new Map<string, Site[]>();
    for (const site of sites) {
      const key = clusterKey(site, zoom);
      const group = groups.get(key);
      if (group) group.push(site);
      else groups.set(key, [site]);
    }
    return [...groups.entries()].map(([key, group]) => ({
      key,
      lat: group.reduce((sum, site) => sum + site.lat, 0) / group.length,
      lng: group.reduce((sum, site) => sum + site.lng, 0) / group.length,
      sites: group,
    }));
  }, [sites, zoom]);

  return (
    <div className="h-full w-full" aria-label="Map of verified waste sites">
      <MapContainer center={[PILOT_CENTRE.lat, PILOT_CENTRE.lng]} zoom={12} className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <MapBridge onReady={onReady} onZoom={setZoom} />
        {userPoint && (
          <CircleMarker
            center={[userPoint.lat, userPoint.lng]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1967d2', fillOpacity: 1 }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}

        {clusters.map((cluster) => {
          const worst = cluster.sites.reduce((max, site) => Math.max(max, site.severity), 0);
          const isCluster = cluster.sites.length > 1;
          const representative = cluster.sites[0]!;
          const icon = L.divIcon({
            className: '',
            iconSize: [isCluster ? 42 : 34, isCluster ? 42 : 34],
            iconAnchor: [isCluster ? 21 : 17, isCluster ? 21 : 17],
            html: isCluster
              ? `<div class="eco-cluster" style="width:42px;height:42px;background:${worst >= 70 ? '#b3261e' : '#0b7a73'}">${cluster.sites.length}</div>`
              : `<div class="eco-pin ${representative.status === 'verified' ? 'eco-pin--verified' : ''}" style="width:34px;height:34px;background:${TYPE_COLOR[representative.type] ?? '#0b7a73'}">${representative.severity}</div>`,
          });

          return (
            <Marker
              key={cluster.key}
              position={[cluster.lat, cluster.lng]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  if (isCluster) map?.flyTo([cluster.lat, cluster.lng], Math.min(zoom + 3, 18), { duration: 0.5 });
                },
              }}
            >
              <Popup minWidth={230}>
                <div className="space-y-2 text-ink">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">
                      {isCluster ? `${cluster.sites.length} reports nearby` : TYPE_LABEL[representative.type]}
                    </strong>
                    <Chip tone={representative.status === 'verified' ? 'accent' : 'neutral'}>
                      {representative.status}
                    </Chip>
                  </div>
                  {!isCluster && representative.evidenceUrl && (
                    <div className="relative overflow-hidden rounded-xl bg-tile border border-line">
                      <img
                        src={representative.evidenceUrl}
                        alt="Sanitized evidence from a verified report"
                        className="h-32 w-full rounded-xl object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div className="hidden h-24 w-full flex-col items-center justify-center p-2 text-center text-xs font-semibold text-muted bg-tile">
                        <span>📸 Verified Evidence On-File</span>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    {representative.reportCount} reports · {representative.reporterCount} distinct reporters ·
                    severity {representative.severity}/100
                  </p>
                  <p className="text-xs text-muted">{representative.boundary.ulb ?? 'Boundary not yet verified'}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                      onClick={() => onOpenComplaint(representative.id)}
                    >
                      View complaint draft
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-ink px-3 py-1.5 text-xs font-bold hover:bg-tile"
                      onClick={() => onOpenScores(representative)}
                    >
                      Locality scores
                    </button>
                    {onBackSite && (
                      <button
                        type="button"
                        className="rounded-full border-2 border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-white transition-colors"
                        onClick={() => onBackSite(representative.id)}
                      >
                        ＋ Back site ({representative.reportCount})
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
