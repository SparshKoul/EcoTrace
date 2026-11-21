import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGps } from '../src/hooks/useGps';

const position = {
  coords: { latitude: 30.5157, longitude: 76.6592, accuracy: 12 },
  timestamp: Date.now(),
} as GeolocationPosition;

const denied = {
  code: 1,
  PERMISSION_DENIED: 1,
  message: 'User denied geolocation',
} as GeolocationPositionError;

const stubGeolocation = (
  getCurrentPosition: Geolocation['getCurrentPosition'],
) => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
      watchPosition: () => 1,
      clearWatch: () => undefined,
    },
  });
};

describe('useGps.locate', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation');
    Reflect.deleteProperty(window, 'isSecureContext');
    vi.unstubAllGlobals();
  });

  it('returns the current position when the browser grants it', async () => {
    stubGeolocation((success) => success(position));
    const { result } = renderHook(() => useGps());

    let resolved: Awaited<ReturnType<ReturnType<typeof useGps>['locate']>> | undefined;
    await act(async () => { resolved = await result.current.locate(); });

    expect(resolved?.fix?.lat).toBe(30.5157);
    expect(resolved?.fix?.lng).toBe(76.6592);
    expect(resolved?.fix?.accuracyM).toBe(12);
    expect(resolved?.error).toBeNull();
  });

  it('explains a permission denial instead of failing silently', async () => {
    stubGeolocation((_success, failure) => failure?.(denied));
    const { result } = renderHook(() => useGps());

    let resolved: Awaited<ReturnType<ReturnType<typeof useGps>['locate']>> | undefined;
    await act(async () => { resolved = await result.current.locate(); });

    expect(resolved?.fix).toBeNull();
    expect(resolved?.error).toContain('blocked');
    expect(result.current.denied).toBe(true);
  });

  it('retries with a lighter location request when the precise GPS fix times out', async () => {
    let calls = 0;
    const timeout = { code: 3, TIMEOUT: 3, PERMISSION_DENIED: 1, message: 'timeout' } as GeolocationPositionError;
    stubGeolocation((success, failure) => {
      calls += 1;
      if (calls === 1) failure?.(timeout);
      else success(position);
    });

    const { result } = renderHook(() => useGps());
    let resolved: Awaited<ReturnType<ReturnType<typeof useGps>['locate']>> | undefined;
    await act(async () => { resolved = await result.current.locate(); });

    expect(calls).toBe(2);
    expect(resolved?.fix?.lat).toBe(30.5157);
    expect(resolved?.error).toBeNull();
  });

  it('centres the map from a public IP lookup when GPS is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        latitude: 30.6799489,
        longitude: 76.7221109,
        city: 'Mohali',
        region: 'Punjab',
        country: 'India',
      }),
    })));

    const { result } = renderHook(() => useGps());
    let resolved: Awaited<ReturnType<ReturnType<typeof useGps>['locateByIp']>> | undefined;
    await act(async () => { resolved = await result.current.locateByIp(); });

    expect(resolved?.location?.lat).toBeCloseTo(30.6799);
    expect(resolved?.location?.label).toContain('Mohali');
    expect(resolved?.error).toBeNull();
  });

  it('reports a clear error when every IP provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    const { result } = renderHook(() => useGps());
    let resolved: Awaited<ReturnType<ReturnType<typeof useGps>['locateByIp']>> | undefined;
    await act(async () => { resolved = await result.current.locateByIp(); });

    expect(resolved?.location).toBeNull();
    expect(resolved?.error).toContain('approximate location');
  });

  it('refuses to ask on an insecure context and says why', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    stubGeolocation((success) => success(position));
    const { result } = renderHook(() => useGps());

    let resolved: Awaited<ReturnType<ReturnType<typeof useGps>['locate']>> | undefined;
    await act(async () => { resolved = await result.current.locate(); });

    expect(resolved?.fix).toBeNull();
    expect(resolved?.error).toContain('HTTPS');
  });
});
