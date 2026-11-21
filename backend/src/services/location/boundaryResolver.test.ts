import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBoundary,
  registerBoundaryRegion,
  clearBoundaryRegions,
  isPointInPolygon,
  isPointInBoundingBox,
  type BoundaryRegion,
} from "./boundaryResolver.js";

describe("Boundary Resolver Service", () => {
  beforeEach(() => {
    clearBoundaryRegions();
    delete process.env.WARD_NAME;
    delete process.env.MLA_CONSTITUENCY_NAME;
    delete process.env.MP_CONSTITUENCY_NAME;
  });

  describe("Geometry helpers", () => {
    it("correctly identifies point inside bounding box", () => {
      const bbox = { minLat: 10, maxLat: 20, minLon: 70, maxLon: 80 };
      assert.equal(isPointInBoundingBox(15, 75, bbox), true);
      assert.equal(isPointInBoundingBox(5, 75, bbox), false);
      assert.equal(isPointInBoundingBox(15, 85, bbox), false);
    });

    it("correctly evaluates point in polygon via ray-casting", () => {
      // Triangle: (0,0), (0,10), (10,0)
      const triangle: [number, number][] = [
        [0, 0],
        [0, 10],
        [10, 0],
      ];
      assert.equal(isPointInPolygon([2, 2], triangle), true);
      assert.equal(isPointInPolygon([8, 8], triangle), false);
    });
  });

  describe("resolveBoundary with Local Datasets", () => {
    it("resolves exact boundary from registered polygon dataset", () => {
      const testRegion: BoundaryRegion = {
        id: "region-indiranagar",
        name: "Indiranagar Civic Area",
        polygon: [
          [12.97, 77.63],
          [12.97, 77.65],
          [12.99, 77.65],
          [12.99, 77.63],
        ],
        ward: {
          id: "WARD-80",
          name: "Hoysala Nagar Ward",
          zone: "East Zone",
          number: 80,
          officer: "S. Rao",
        },
        mla: {
          constituencyId: "AC-163",
          constituencyName: "CV Raman Nagar",
          representativeName: "S. Raghu",
        },
        mp: {
          constituencyId: "PC-25",
          constituencyName: "Bangalore Central",
          representativeName: "P. Mohan",
        },
      };

      registerBoundaryRegion(testRegion);

      // Point inside Indiranagar
      const result = resolveBoundary({ lat: 12.98, lon: 77.64 });
      assert.equal(result.resolvedVia, "local-dataset");
      assert.equal(result.ward.id, "WARD-80");
      assert.equal(result.ward.name, "Hoysala Nagar Ward");
      assert.equal(result.mla.constituencyId, "AC-163");
      assert.equal(result.mp.constituencyName, "Bangalore Central");
    });

    it("resolves boundary from registered bounding box dataset", () => {
      const bboxRegion: BoundaryRegion = {
        id: "region-koramangala",
        name: "Koramangala Zone",
        boundingBox: {
          minLat: 12.92,
          maxLat: 12.94,
          minLon: 77.61,
          maxLon: 77.63,
        },
        ward: {
          id: "WARD-151",
          name: "Koramangala Ward",
          zone: "South Zone",
          number: 151,
        },
        mla: {
          constituencyId: "AC-173",
          constituencyName: "BTM Layout",
          representativeName: "Ramalinga Reddy",
        },
        mp: {
          constituencyId: "PC-26",
          constituencyName: "Bangalore South",
          representativeName: "Tejasvi Surya",
        },
      };

      registerBoundaryRegion(bboxRegion);

      const result = resolveBoundary({ latitude: 12.93, longitude: 77.62 });
      assert.equal(result.resolvedVia, "local-dataset");
      assert.equal(result.ward.name, "Koramangala Ward");
      assert.equal(result.mla.constituencyName, "BTM Layout");
      assert.equal(result.mp.representativeName, "Tejasvi Surya");
    });
  });

  describe("resolveBoundary with Environment Variables & Defaults", () => {
    it("falls back to environment variables when coordinates are outside dataset", () => {
      process.env.WARD_NAME = "Whitefield Ward";
      process.env.MLA_CONSTITUENCY_NAME = "Mahadevapura Assembly";
      process.env.MP_CONSTITUENCY_NAME = "Bangalore Central Seat";

      const result = resolveBoundary({ lat: 28.6139, lon: 77.209 }); // Delhi coordinates
      assert.equal(result.resolvedVia, "environment-variable");
      assert.equal(result.ward.name, "Whitefield Ward");
      assert.equal(result.mla.constituencyName, "Mahadevapura Assembly");
      assert.equal(result.mp.constituencyName, "Bangalore Central Seat");
    });

    it("provides default values when no environment variables or dataset matches", () => {
      const result = resolveBoundary({ lat: 10.0, lon: 20.0 });
      assert.equal(result.resolvedVia, "default");
      assert.ok(result.ward.id);
      assert.ok(result.ward.name);
      assert.ok(result.mla.constituencyName);
      assert.ok(result.mp.constituencyName);
    });
  });
});
