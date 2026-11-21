import { describe, expect, it } from 'vitest';
import { clusterKey, distanceMeters, formatDistance } from '../src/domain/geo';

describe('distanceMeters', () => {
  it('returns zero for identical points', () => {
    expect(distanceMeters({ lat: 26.2389, lng: 73.0243 }, { lat: 26.2389, lng: 73.0243 })).toBe(0);
  });

  it('matches the 20 m merge radius at this latitude', () => {
    const origin = { lat: 26.2389, lng: 73.0243 };
    const at20m = { lat: origin.lat, lng: origin.lng + 20 / (111_320 * Math.cos((origin.lat * Math.PI) / 180)) };
    expect(distanceMeters(origin, at20m)).toBeCloseTo(20, 0);
  });

  it('formats short and long distances', () => {
    expect(formatDistance(950)).toBe('950 m away');
    expect(formatDistance(2_450)).toBe('2.5 km away');
  });
});

describe('clusterKey', () => {
  it('groups the same point into one display cluster at a fixed zoom', () => {
    const point = { lat: 26.2389, lng: 73.0243 };
    expect(clusterKey(point, 12)).toBe(clusterKey(point, 12));
  });

  it('changes cells when the zoom changes', () => {
    const point = { lat: 26.2389, lng: 73.0243 };
    expect(clusterKey(point, 12)).not.toBe(clusterKey(point, 13));
  });
});
