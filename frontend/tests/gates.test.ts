import { describe, expect, it } from 'vitest';
import { missingBinGate, recordGate, shutterGate, submitGate } from '../src/domain/captureGates';
import type { GpsFix } from '../src/types';

const fix = (accuracyM: number): GpsFix => ({
  lat: 26.2389,
  lng: 73.0243,
  accuracyM,
  timestamp: Date.now(),
});

const base = {
  online: true,
  signedIn: true,
  cameraState: 'live' as const,
  recorderSupported: true,
  chosen: true,
};

describe('capture gates', () => {
  it('blocks a snapshot when GPS accuracy is worse than 30 m', () => {
    expect(shutterGate({ ...base, fix: fix(45) }).kind).toBe('waiting');
  });

  it('accepts a snapshot when the camera is live and GPS is locked', () => {
    expect(shutterGate({ ...base, fix: fix(18) }).kind).toBe('ready');
  });

  it('refuses recording without MediaRecorder', () => {
    const state = recordGate({ ...base, recorderSupported: false, fix: fix(10) });
    expect(state.kind).toBe('blocked');
  });

  it('still requires accurate GPS for a missing-bin marker', () => {
    expect(missingBinGate({ fix: fix(100), online: true, signedIn: true }).kind).toBe('waiting');
    expect(missingBinGate({ fix: fix(12), online: true, signedIn: true }).kind).toBe('ready');
  });

  it('asks for sign-in and blocks offline submissions', () => {
    const state = submitGate({ ...base, fix: fix(10), signedIn: false });
    expect(state.kind === 'blocked' && state.action).toBe('signIn');
    expect(submitGate({ ...base, fix: fix(10), online: false }).kind).toBe('blocked');
  });

  it('requires a chosen waste type on final submit', () => {
    expect(submitGate({ ...base, fix: fix(10), chosen: false }).kind).toBe('blocked');
  });
});
