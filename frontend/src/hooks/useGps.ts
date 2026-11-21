import { useCallback, useEffect, useState } from 'react';
import { RULES } from '../config/rules';
import type { GpsFix } from '../types';

export interface LocateResult {
  readonly fix: GpsFix | null;
  /** A human-readable reason when no fix was obtained, null on success. */
  readonly error: string | null;
}

export interface GpsState {
  readonly fix: GpsFix | null;
  readonly denied: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
  /** Explicit one-shot request used by the "Use my current location" action. */
  readonly locate: () => Promise<LocateResult>;
}

const toFix = (position: GeolocationPosition): GpsFix => {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracyM: Number.isFinite(accuracy) ? accuracy : Number.POSITIVE_INFINITY,
    timestamp: position.timestamp || Date.now(),
  };
};

const positionErrorText = (error: GeolocationPositionError): string => {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location access is blocked. Allow it for this site in your browser settings, then try again.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Getting a GPS fix took too long. Move outdoors and try again.';
  }
  return 'We could not get a GPS fix. Check that location services are on, then try again.';
};

/** FR-1.2: a continuous high-accuracy watch. Acceptance is decided by the capture gates, not here. */
export function useGps(): GpsState {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const locate = useCallback((): Promise<LocateResult> => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const message = 'Location needs a secure context. Open this app on localhost or over HTTPS.';
      setError(message);
      return Promise.resolve({ fix: null, error: message });
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = 'This browser or preview does not expose geolocation. You can keep the Chitkara University view, or open the app in a normal browser tab.';
      setDenied(true);
      setError(message);
      return Promise.resolve({ fix: null, error: message });
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = toFix(position);
          setFix(next);
          setDenied(false);
          setError(null);
          resolve({ fix: next, error: null });
        },
        (positionError) => {
          const message = positionErrorText(positionError);
          if (positionError.code === positionError.PERMISSION_DENIED) setDenied(true);
          setError(message);
          resolve({ fix: null, error: message });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = toFix(position);
        if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
        setFix(next);
        setDenied(false);
        setError(null);
        setLoading(false);
      },
      () => setLoading(false),
      {
        enableHighAccuracy: true,
        maximumAge: Math.min(5_000, RULES.GPS_MAX_AGE_MS),
        timeout: 30_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [nonce]);

  return { fix, denied, loading, error, refresh, locate };
}
