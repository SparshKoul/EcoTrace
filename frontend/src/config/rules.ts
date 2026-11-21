/**
 * Rules enforced by backend/microservice, mirrored here so the UI can explain a block before it happens.
 * Values come from the EcoTrace PRD; keep them in sync with the server when it lands.
 */

const readNumber = (key: string, fallback: number): number => {
  const raw = import.meta.env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const readString = (key: string, fallback: string): string => {
  const raw = import.meta.env[key];
  return raw === undefined || raw === '' ? fallback : raw;
};

export const RULES = {
  /** FR-1.2: no submission without a GPS fix this accurate. */
  GPS_MAX_ACCURACY_M: 30,
  /** A fix older than this is stale; ask the device for a fresh one. */
  GPS_MAX_AGE_MS: 10_000,
  /** FR-2.2: PostGIS ST_DWithin merge radius, in metres. */
  SITE_MERGE_RADIUS_M: 20,
  /** FR-2.5: scores and scorecards stay hidden until this many distinct reporters. */
  MIN_VERIFIED_REPORTS: 10,
  /** FR-1.3: "missing bin" means no accessible dustbin within 1 km. */
  NO_BIN_RADIUS_M: 1_000,
  /** FR-1.1: walking-mode capture length. */
  WALKING_MIN_MS: 5_000,
  WALKING_MAX_MS: 10_000,
} as const;

const resolveApiBaseUrl = (): string => {
  const configured = readString('VITE_API_BASE_URL', '');
  if (configured) return configured;
  // If running on a mobile device or LAN IP (e.g. 192.168.x.x), target the same IP on port 8000
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
};

export const API_BASE_URL = resolveApiBaseUrl();

export const USE_MOCK_API = readString('VITE_USE_MOCK_API', 'true').toLowerCase() === 'true';

export const TILE_URL = readString(
  'VITE_TILE_URL',
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
);

export const TILE_ATTRIBUTION = readString(
  'VITE_TILE_ATTRIBUTION',
  '&copy; OpenStreetMap contributors',
);

/** Chitkara University, Rajpura, Punjab — the default pilot view until the citizen shares their location. */
export const PILOT_CENTRE = {
  lat: readNumber('VITE_PILOT_LAT', 30.5157),
  lng: readNumber('VITE_PILOT_LNG', 76.6592),
} as const;

export const TYPE_LABEL: Record<string, string> = {
  dump: 'Garbage dump',
  no_bin: 'No dustbin within 1 km',
  water: 'Water stagnation',
  construction: 'Construction waste',
  overflowing_bin: 'Overflowing / broken bin',
};

export const TYPE_COLOR: Record<string, string> = {
  dump: '#c5221f',
  no_bin: '#e37400',
  water: '#1967d2',
  construction: '#5d4037',
  overflowing_bin: '#7b3fa6',
};
