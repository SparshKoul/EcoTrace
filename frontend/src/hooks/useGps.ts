import { useCallback, useEffect, useState } from 'react';
import { RULES } from '../config/rules';
import type { GpsFix } from '../types';

export interface GpsState {
  readonly fix: GpsFix | null;
  readonly denied: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

/** FR-1.2: a continuous high-accuracy watch. Acceptance is decided by the capture gates, not here. */
export function useGps(): GpsState {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

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
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setFix({
          lat: latitude,
          lng: longitude,
          accuracyM: Number.isFinite(accuracy) ? accuracy : Number.POSITIVE_INFINITY,
          timestamp: position.timestamp || Date.now(),
        });
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

  return { fix, denied, loading, error, refresh };
}
