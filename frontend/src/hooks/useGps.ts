import { useCallback, useEffect, useState } from 'react';
import { RULES } from '../config/rules';
import type { GpsFix } from '../types';

export interface GpsState {
  readonly fix: GpsFix | null;
  readonly denied: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
  /** Explicit one-shot request used by the "Use my current location" action. */
  readonly locate: () => Promise<GpsFix | null>;
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

/** FR-1.2: a continuous high-accuracy watch. Acceptance is decided by the capture gates, not here. */
export function useGps(): GpsState {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const locate = useCallback((): Promise<GpsFix | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true);
      setError('This device has no geolocation support.');
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = toFix(position);
          setFix(next);
          setDenied(false);
          setError(null);
          resolve(next);
        },
        (positionError) => {
          if (positionError.code === positionError.PERMISSION_DENIED) {
            setDenied(true);
            setError('Location access was blocked. Allow it in your browser settings.');
          } else {
            setError('Could not get your location. Try again outdoors.');
          }
          resolve(null);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      setError('This device has no geolocation support.');
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
      (positionError) => {
        setLoading(false);
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setDenied(true);
          setError('Location access was blocked. Allow it to submit a report.');
        } else {
          setError('Location is unavailable right now. Move outdoors and try again.');
        }
      },
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
