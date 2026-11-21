import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  haversineDistance,
  findNearbySite,
  assignReportToSite,
  clusterReports,
  type ReportInput,
  type Site,
} from "./siteMerger.js";

describe("Spatial Clustering & Site Merger", () => {
  describe("haversineDistance", () => {
    it("returns 0 for identical coordinates", () => {
      const dist = haversineDistance(12.9716, 77.5946, 12.9716, 77.5946);
      assert.equal(dist, 0);
    });

    it("is symmetric: dist(A, B) === dist(B, A)", () => {
      const distAB = haversineDistance(12.9716, 77.5946, 12.9725, 77.5955);
      const distBA = haversineDistance(12.9725, 77.5955, 12.9716, 77.5946);
      assert.ok(Math.abs(distAB - distBA) < 1e-6);
    });

    it("accurately calculates known real-world distance (~111 km per latitude degree)", () => {
      // 1 degree of latitude at the equator is approximately 111.195 km = 111,195 m
      const dist = haversineDistance(0, 0, 1, 0);
      assert.ok(dist > 111000 && dist < 111500, `Expected ~111.195km, got ${dist}`);
    });

    it("accurately calculates short-range distances in meters", () => {
      // At lat 12.9716, moving ~0.00009 degrees north is ~10.0 meters
      const dist10m = haversineDistance(12.9716, 77.5946, 12.97169, 77.5946);
      assert.ok(
        Math.abs(dist10m - 10) < 0.5,
        `Expected ~10m, got ${dist10m}`
      );

      // At lat 12.9716, moving ~0.00045 degrees north is ~50.0 meters
      const dist50m = haversineDistance(12.9716, 77.5946, 12.97205, 77.5946);
      assert.ok(
        Math.abs(dist50m - 50) < 0.8,
        `Expected ~50m, got ${dist50m}`
      );
    });
  });

  describe("findNearbySite", () => {
    const baseSite: Site = {
      id: "site-001",
      latitude: 12.9716,
      longitude: 77.5946,
      reportIds: ["rep-01"],
      reportCount: 1,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("finds site when point is within 20m (e.g. ~10m away)", () => {
      // ~10m north
      const reportLat = 12.97169;
      const reportLon = 77.5946;

      const found = findNearbySite(reportLat, reportLon, [baseSite], 20);
      assert.notEqual(found, null);
      assert.equal(found?.id, "site-001");
    });

    it("finds site when point is exactly at boundary threshold (<= 20m)", () => {
      // Calculate coordinates exactly ~18m away
      const reportLat = 12.9716 + (18 / 111139);
      const reportLon = 77.5946;

      const found = findNearbySite(reportLat, reportLon, [baseSite], 20);
      assert.notEqual(found, null);
      assert.equal(found?.id, "site-001");
    });

    it("returns null when point is further than 20m (e.g. ~50m away)", () => {
      // ~50m away
      const reportLat = 12.97205;
      const reportLon = 77.5946;

      const found = findNearbySite(reportLat, reportLon, [baseSite], 20);
      assert.equal(found, null);
    });

    it("returns closest site when multiple sites are in range", () => {
      const siteClose: Site = {
        id: "site-close",
        latitude: 12.971605, // ~0.5m away
        longitude: 77.5946,
        reportIds: ["r1"],
        reportCount: 1,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const siteFarther: Site = {
        id: "site-farther",
        latitude: 12.9717, // ~11m away
        longitude: 77.5946,
        reportIds: ["r2"],
        reportCount: 1,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const found = findNearbySite(12.9716, 77.5946, [siteFarther, siteClose], 20);
      assert.equal(found?.id, "site-close");
    });
  });

  describe("assignReportToSite & 20m Grouping", () => {
    it("groups points <= 20m into the same site and updates centroid", () => {
      const existingSites: Site[] = [];

      const report1: ReportInput = {
        id: "rep-1",
        latitude: 12.9716,
        longitude: 77.5946,
        wasteType: "plastic",
      };

      // ~10m away
      const report2: ReportInput = {
        id: "rep-2",
        latitude: 12.97169,
        longitude: 77.5946,
        wasteType: "plastic",
      };

      const res1 = assignReportToSite(report1, existingSites, 20);
      assert.equal(res1.isNew, true);
      assert.equal(existingSites.length, 1);
      assert.equal(res1.site.reportCount, 1);
      assert.deepEqual(res1.site.reportIds, ["rep-1"]);

      const res2 = assignReportToSite(report2, existingSites, 20);
      assert.equal(res2.isNew, false);
      assert.equal(existingSites.length, 1); // Still 1 site!
      assert.equal(res2.site.id, res1.site.id);
      assert.equal(res2.site.reportCount, 2);
      assert.deepEqual(res2.site.reportIds, ["rep-1", "rep-2"]);

      // Centroid should be updated to average of the two reports
      const expectedLat = (12.9716 + 12.97169) / 2;
      assert.ok(Math.abs(res2.site.latitude - expectedLat) < 1e-6);
    });

    it("creates separate sites for points > 20m apart", () => {
      const existingSites: Site[] = [];

      const report1: ReportInput = {
        id: "rep-1",
        latitude: 12.9716,
        longitude: 77.5946,
      };

      // ~50m away (> 20m)
      const report2: ReportInput = {
        id: "rep-2",
        latitude: 12.97205,
        longitude: 77.5946,
      };

      const res1 = assignReportToSite(report1, existingSites, 20);
      const res2 = assignReportToSite(report2, existingSites, 20);

      assert.equal(res1.isNew, true);
      assert.equal(res2.isNew, true);
      assert.equal(existingSites.length, 2);
      assert.notEqual(res1.site.id, res2.site.id);
      assert.deepEqual(existingSites[0].reportIds, ["rep-1"]);
      assert.deepEqual(existingSites[1].reportIds, ["rep-2"]);
    });
  });

  describe("clusterReports", () => {
    it("correctly clusters a batch of mixed proximal and distant reports", () => {
      const reports: ReportInput[] = [
        // Cluster A (within 10m of each other)
        { id: "a1", latitude: 12.9716, longitude: 77.5946 },
        { id: "a2", latitude: 12.97165, longitude: 77.5946 }, // ~5.5m away
        { id: "a3", latitude: 12.97168, longitude: 77.5946 }, // ~8.8m away

        // Cluster B (~200m away from A)
        { id: "b1", latitude: 12.9734, longitude: 77.5946 },
        { id: "b2", latitude: 12.97345, longitude: 77.5946 }, // ~5.5m away

        // Isolated Report C (~1km away)
        { id: "c1", latitude: 12.9806, longitude: 77.5946 },
      ];

      const clusters = clusterReports(reports, 20);

      // Should produce exactly 3 sites
      assert.equal(clusters.length, 3);

      const clusterA = clusters.find((c) => c.reportIds.includes("a1"));
      const clusterB = clusters.find((c) => c.reportIds.includes("b1"));
      const clusterC = clusters.find((c) => c.reportIds.includes("c1"));

      assert.ok(clusterA);
      assert.ok(clusterB);
      assert.ok(clusterC);

      assert.deepEqual(clusterA?.reportIds, ["a1", "a2", "a3"]);
      assert.equal(clusterA?.reportCount, 3);

      assert.deepEqual(clusterB?.reportIds, ["b1", "b2"]);
      assert.equal(clusterB?.reportCount, 2);

      assert.deepEqual(clusterC?.reportIds, ["c1"]);
      assert.equal(clusterC?.reportCount, 1);
    });
  });
});
