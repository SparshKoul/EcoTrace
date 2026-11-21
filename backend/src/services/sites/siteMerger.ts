/**
 * EcoTrace Spatial Clustering & Site Merger Service
 * Implements 20-meter spatial clustering for waste reports using the Haversine formula.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ReportInput {
  id: string;
  latitude: number;
  longitude: number;
  wasteType?: string;
  photoUrl?: string;
  description?: string;
  createdAt?: string | Date;
  [key: string]: unknown;
}

export interface Site {
  id: string;
  latitude: number;
  longitude: number;
  reportIds: string[];
  reportCount: number;
  wasteType?: string;
  status: "active" | "cleaning" | "resolved" | "archived" | string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/** Earth's mean radius in meters */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Converts degrees to radians.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates the great-circle distance between two GPS coordinates using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance between points in meters
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  // Clamping to [0, 1] to guard against rare floating-point rounding errors exceeding 1.0
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Finds the nearest existing site within thresholdMeters of a report location.
 *
 * @param newReportLat Latitude of the incoming report
 * @param newReportLon Longitude of the incoming report
 * @param existingSites Array of existing sites to search
 * @param thresholdMeters Maximum distance in meters to consider as the same site (default: 20m)
 * @returns The closest matching Site within threshold, or null if no site is within threshold
 */
export function findNearbySite(
  newReportLat: number,
  newReportLon: number,
  existingSites: Site[],
  thresholdMeters = 20
): Site | null {
  let closestSite: Site | null = null;
  let minDistance = Infinity;

  for (const site of existingSites) {
    const dist = haversineDistance(
      newReportLat,
      newReportLon,
      site.latitude,
      site.longitude
    );

    if (dist <= thresholdMeters && dist < minDistance) {
      minDistance = dist;
      closestSite = site;
    }
  }

  return closestSite;
}

/**
 * Assigns an incoming report to an existing nearby site (within thresholdMeters)
 * or creates a new site anchored at the report's coordinates.
 *
 * @param report Incoming report to process
 * @param existingSites Current collection of active sites
 * @param thresholdMeters Maximum cluster distance in meters (default: 20m)
 * @returns An object containing the assigned site and a boolean indicating if it was newly created
 */
export function assignReportToSite(
  report: ReportInput,
  existingSites: Site[],
  thresholdMeters = 20
): { site: Site; isNew: boolean } {
  const nearbySite = findNearbySite(
    report.latitude,
    report.longitude,
    existingSites,
    thresholdMeters
  );

  const nowIso = new Date().toISOString();

  if (nearbySite) {
    // Add report to existing site and update centroid
    if (!nearbySite.reportIds.includes(report.id)) {
      const currentCount = nearbySite.reportCount;
      const newCount = currentCount + 1;

      // Incremental centroid calculation
      nearbySite.latitude =
        (nearbySite.latitude * currentCount + report.latitude) / newCount;
      nearbySite.longitude =
        (nearbySite.longitude * currentCount + report.longitude) / newCount;

      nearbySite.reportIds.push(report.id);
      nearbySite.reportCount = newCount;
    }

    if (report.wasteType && !nearbySite.wasteType) {
      nearbySite.wasteType = report.wasteType;
    }

    nearbySite.updatedAt = nowIso;
    return { site: nearbySite, isNew: false };
  }

  // Create a new site for this report
  const newSite: Site = {
    id: `site_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    latitude: report.latitude,
    longitude: report.longitude,
    reportIds: [report.id],
    reportCount: 1,
    wasteType: report.wasteType,
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  existingSites.push(newSite);
  return { site: newSite, isNew: true };
}

/**
 * Groups an array of reports into clustered sites using the 20-meter threshold.
 * Reports within 20 meters of each other are clustered into a shared site.
 *
 * @param reports Array of waste reports to cluster
 * @param thresholdMeters Spatial distance threshold in meters (default: 20m)
 * @returns Array of clustered sites
 */
export function clusterReports(
  reports: ReportInput[],
  thresholdMeters = 20
): Site[] {
  const sites: Site[] = [];

  for (const report of reports) {
    assignReportToSite(report, sites, thresholdMeters);
  }

  return sites;
}
