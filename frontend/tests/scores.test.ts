import { describe, expect, it } from 'vitest';
import { computeAreaScores, scoreTone } from '../src/domain/scores';
import type { Site } from '../src/types';

const site = (overrides: Partial<Site>): Site => ({
  id: 'x',
  lat: 26.2,
  lng: 73.0,
  type: 'dump',
  wasteStream: 'mixed',
  severity: 50,
  status: 'open',
  reportCount: 1,
  reporterCount: 1,
  nearBin: false,
  evidenceUrl: null,
  boundary: { ulb: null, mla: null, mp: null },
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('computeAreaScores', () => {
  const sites: Site[] = [
    site({ id: '1', status: 'cleared', nearBin: false }),
    site({ id: '2', status: 'open', nearBin: true }),
    site({ id: '3', type: 'no_bin' }),
  ];

  it('stays locked below ten distinct reporters', () => {
    expect(computeAreaScores(sites, 9)).toBeNull();
  });

  it('computes the three diagnostic pillars at the quorum', () => {
    const scores = computeAreaScores(sites, 10);
    expect(scores).toEqual({ clearing: 33, citizenDumping: 50, binAccess: 67 });
  });

  it('maps scores to tones', () => {
    expect(scoreTone(85)).toBe('good');
    expect(scoreTone(50)).toBe('warn');
    expect(scoreTone(20)).toBe('bad');
  });
});
