/**
 * EcoTrace Boundary Resolution Service
 * Resolves GPS coordinates to Municipal Ward, Assembly Constituency (MLA),
 * and Parliamentary Constituency (MP) using local polygon/bbox datasets or
 * configurable environment variables.
 */

import fs from "node:fs";
import path from "node:path";

export interface WardInfo {
  id: string;
  name: string;
  zone?: string;
  number?: number;
  officer?: string;
  contactEmail?: string;
}

export interface MLAInfo {
  constituencyId: string;
  constituencyName: string;
  representativeName?: string;
  state?: string;
  contactEmail?: string;
}

export interface MPInfo {
  constituencyId: string;
  constituencyName: string;
  representativeName?: string;
  state?: string;
  contactEmail?: string;
}

export interface ResolvedBoundary {
  ward: WardInfo;
  mla: MLAInfo;
  mp: MPInfo;
  resolvedVia: "local-dataset" | "environment-variable" | "default";
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface BoundaryRegion {
  id: string;
  name: string;
  /** Bounding box [minLat, maxLat, minLon, maxLon] or object */
  boundingBox?: BoundingBox;
  /** Array of [latitude, longitude] pairs defining a polygon */
  polygon?: [number, number][];
  ward?: WardInfo;
  mla?: MLAInfo;
  mp?: MPInfo;
}

export type LatLonInput =
  | { lat: number; lon: number }
  | { latitude: number; longitude: number };

/**
 * Checks if a point [lat, lon] falls inside a 2D polygon using the ray-casting algorithm.
 */
export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  const [lat, lon] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > lon !== yj > lon &&
      lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a point [lat, lon] falls inside a bounding box.
 */
export function isPointInBoundingBox(
  lat: number,
  lon: number,
  bbox: BoundingBox
): boolean {
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lon >= bbox.minLon &&
    lon <= bbox.maxLon
  );
}

// In-memory registry of boundary regions (can be populated via file or dynamically)
const registeredRegions: BoundaryRegion[] = [];

/**
 * Registers an administrative boundary region into the local dataset.
 */
export function registerBoundaryRegion(region: BoundaryRegion): void {
  registeredRegions.push(region);
}

/**
 * Overwrites all registered boundary regions with the provided dataset.
 */
export function setBoundaryRegions(regions: BoundaryRegion[]): void {
  registeredRegions.length = 0;
  registeredRegions.push(...regions);
}

/**
 * Clears all registered boundary regions.
 */
export function clearBoundaryRegions(): void {
  registeredRegions.length = 0;
}

/**
 * Loads boundary definitions from a local JSON file if configured or present.
 */
export function loadBoundariesFromFile(customPath?: string): boolean {
  const filePath =
    customPath ||
    process.env.BOUNDARY_DATA_PATH ||
    path.join(__dirname, "data", "boundaries.json");

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        setBoundaryRegions(parsed);
        return true;
      }
    }
  } catch {
    // Fall back to env variables gracefully if reading fails
  }
  return false;
}

/**
 * Resolves environmental defaults from process.env or sensible fallbacks.
 */
function getEnvironmentFallback(): {
  ward: WardInfo;
  mla: MLAInfo;
  mp: MPInfo;
} {
  return {
    ward: {
      id: process.env.WARD_ID || "WARD-DEFAULT-01",
      name: process.env.WARD_NAME || "Central Municipal Ward",
      zone: process.env.WARD_ZONE || "Central Zone",
      number: process.env.WARD_NUMBER ? Number(process.env.WARD_NUMBER) : 1,
      officer: process.env.WARD_OFFICER || "Ward Officer",
      contactEmail: process.env.WARD_EMAIL || "ward-officer@ecotrace.local",
    },
    mla: {
      constituencyId: process.env.MLA_CONSTITUENCY_ID || "MLA-AC-01",
      constituencyName:
        process.env.MLA_CONSTITUENCY_NAME || "Central Assembly Constituency",
      representativeName:
        process.env.MLA_REPRESENTATIVE || "Assembly Representative",
      state: process.env.MLA_STATE || "State Capital",
      contactEmail: process.env.MLA_EMAIL || "mla-central@ecotrace.local",
    },
    mp: {
      constituencyId: process.env.MP_CONSTITUENCY_ID || "MP-PC-01",
      constituencyName:
        process.env.MP_CONSTITUENCY_NAME || "Central Parliamentary Seat",
      representativeName:
        process.env.MP_REPRESENTATIVE || "Member of Parliament",
      state: process.env.MP_STATE || "National",
      contactEmail: process.env.MP_EMAIL || "mp-central@ecotrace.local",
    },
  };
}

/**
 * Normalizes latitude and longitude from flexible input shapes.
 */
function normalizeCoords(coords: LatLonInput): { lat: number; lon: number } {
  if ("latitude" in coords && "longitude" in coords) {
    return { lat: coords.latitude, lon: coords.longitude };
  }
  return { lat: coords.lat, lon: coords.lon };
}

/**
 * Resolves a given GPS coordinate { lat, lon } into administrative boundaries:
 * Municipal Ward, Assembly Constituency (MLA), and Parliamentary Constituency (MP).
 *
 * Evaluation order:
 * 1. Matches against registered local boundary data (Polygons or Bounding Boxes).
 * 2. If no polygon/bbox matches, checks for environment variables.
 * 3. Falls back to default administrative profile.
 *
 * @param coords GPS coordinates { lat, lon } or { latitude, longitude }
 * @returns Resolved administrative boundary details
 */
export function resolveBoundary(coords: LatLonInput): ResolvedBoundary {
  const { lat, lon } = normalizeCoords(coords);

  // 1. Check local boundary datasets
  for (const region of registeredRegions) {
    let matches = false;

    if (region.polygon && region.polygon.length >= 3) {
      matches = isPointInPolygon([lat, lon], region.polygon);
    } else if (region.boundingBox) {
      matches = isPointInBoundingBox(lat, lon, region.boundingBox);
    }

    if (matches && region.ward && region.mla && region.mp) {
      return {
        ward: { ...region.ward },
        mla: { ...region.mla },
        mp: { ...region.mp },
        resolvedVia: "local-dataset",
      };
    }
  }

  // 2. Resolve via environment variables or default fallback
  const envConfig = getEnvironmentFallback();
  const hasCustomEnv = Boolean(
    process.env.WARD_NAME ||
      process.env.MLA_CONSTITUENCY_NAME ||
      process.env.MP_CONSTITUENCY_NAME
  );

  return {
    ward: envConfig.ward,
    mla: envConfig.mla,
    mp: envConfig.mp,
    resolvedVia: hasCustomEnv ? "environment-variable" : "default",
  };
}
