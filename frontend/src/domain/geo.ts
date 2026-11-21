import type { GeoPoint } from '../types';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. Uses the same spherical model as PostGIS geography. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Human-readable distance for chips and list rows. */
export function formatDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)} m away`;
  return `${(meters / 1_000).toFixed(1)} km away`;
}

/**
 * Lightweight client-side clustering: snap points to a latitude-scaled grid so nearby sites share a marker.
 * This is display-only; the backend remains the source of truth for the 20 m deduplication rule.
 */
export function clusterKey(point: GeoPoint, zoom: number): string {
  const cellDegrees = 360 / (2 ** Math.max(1, Math.min(zoom, 19)) * 256);
  const latCell = Math.floor(point.lat / cellDegrees);
  const lngCell = Math.floor(point.lng / (cellDegrees / Math.max(0.2, Math.cos(toRad(point.lat)))));
  return `${zoom}:${latCell}:${lngCell}`;
}
