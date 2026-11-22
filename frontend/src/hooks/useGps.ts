import { useCallback, useEffect, useState } from 'react';
import { RULES } from '../config/rules';
import type { GpsFix } from '../types';

export interface LocateResult {
  readonly fix: GpsFix | null;
  /** A human-readable reason when no fix was obtained, null on success. */
  readonly error: string | null;
}

/** City-level location derived from the public IP, used when the browser will not share GPS. */
export interface ApproxLocation {
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
}

export interface IpLocateResult {
  readonly location: ApproxLocation | null;
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
  /** City-level fallback for visitors on HTTP/IP URLs where the browser blocks geolocation. */
  readonly locateByIp: () => Promise<IpLocateResult>;
}

const toFix = (position: GeolocationPosition): GpsFix => {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracyM: Number.isFinite(accuracy) ? accuracy : Number.POSITIVE_INFINITY,
    timestamp: Date.now(),
  };
};

const positionErrorText = (error: GeolocationPositionError): string => {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location access is blocked. Allow it for this site in your browser settings, then try again.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Your browser could not return a location in time. Check that location services are enabled, then try again.';
  }
  return 'Your browser could not determine a location. Check location services and try again.';
};

const requestPosition = (options: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

/** FR-1.2: a continuous high-accuracy watch. Acceptance is decided by the capture gates, not here. */
export function useGps(): GpsState {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const locate = useCallback(async (): Promise<LocateResult> => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const message = 'Location needs a secure context. Open this app on localhost or over HTTPS.';
      setError(message);
      return { fix: null, error: message };
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = 'This browser or preview does not expose geolocation. You can keep the Chitkara University view, or open the app in a normal browser tab.';
      setDenied(true);
      setError(message);
      return { fix: null, error: message };
    }

    let position: GeolocationPosition;
    try {
      // First ask the device for its best fix with cached fix allowed (up to 30s) so it returns fast.
      position = await requestPosition({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 2_000 });
    } catch (firstError) {
      const first = firstError as GeolocationPositionError;
      if (first.code === first.PERMISSION_DENIED) {
        setDenied(true);
        const message = positionErrorText(first);
        setError(message);
        return { fix: null, error: message };
      }
      try {
        // Second attempt accepts a cached or network-based fix, which arrives quickly without GPS hardware.
        position = await requestPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 2_500 });
      } catch (secondError) {
        const second = secondError as GeolocationPositionError;
        const message = positionErrorText(second.code === second.PERMISSION_DENIED ? second : first);
        if (second.code === second.PERMISSION_DENIED) setDenied(true);
        setError(message);
        return { fix: null, error: message };
      }
    }

    const next = toFix(position);
    setFix(next);
    setDenied(false);
    setError(null);
    return { fix: next, error: null };
  }, []);

  const locateByIp = useCallback(async (): Promise<IpLocateResult> => {
    const providers: readonly (() => Promise<ApproxLocation | null>)[] = [
      async () => {
        const response = await fetch('https://ipwho.is/', { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json() as {
          success?: boolean; latitude?: number; longitude?: number; city?: string; region?: string; country?: string;
        };
        const { latitude, longitude } = data;
        if (data.success === false || typeof latitude !== 'number' || typeof longitude !== 'number'
          || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
          lat: latitude,
          lng: longitude,
          label: [data.city, data.region, data.country].filter(Boolean).join(', '),
        };
      },
      async () => {
        const response = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json() as {
          latitude?: number; longitude?: number; city?: string; region?: string; country_name?: string; error?: boolean;
        };
        const { latitude, longitude } = data;
        if (data.error || typeof latitude !== 'number' || typeof longitude !== 'number'
          || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
          lat: latitude,
          lng: longitude,
          label: [data.city, data.region, data.country_name].filter(Boolean).join(', '),
        };
      },
    ];

    for (const provider of providers) {
      try {
        const location = await provider();
        if (location) return { location, error: null };
      } catch {
        // Try the next provider; a blocked or offline service must not dead-end the UI.
      }
    }
    return {
      location: null,
      error: 'Could not look up your approximate location. Check your connection and try again.',
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    let activeWatchId: number | null = null;
    let fallbackStarted = false;

    const startWatch = (highAccuracy: boolean) => {
      activeWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const next = toFix(position);
          if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
          setFix(next);
          setDenied(false);
          setError(null);
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          if (err && err.code === err.PERMISSION_DENIED) {
            setDenied(true);
            return;
          }
          // If high-accuracy watch times out or fails (common on laptops without GPS), fallback to network watch!
          if (highAccuracy && !fallbackStarted) {
            fallbackStarted = true;
            if (activeWatchId !== null) {
              navigator.geolocation.clearWatch(activeWatchId);
            }
            startWatch(false);
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          maximumAge: highAccuracy ? Math.min(5_000, RULES.GPS_MAX_AGE_MS) : 15_000,
          timeout: highAccuracy ? 5_000 : 15_000,
        },
      );
    };

    startWatch(true);

    // Heartbeat auto-refresh: ensures location stays fresh even if device is stationary (Google Maps style)
    const heartbeat = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const next = toFix(position);
            if (Number.isFinite(next.lat) && Number.isFinite(next.lng)) {
              setFix(next);
              setDenied(false);
            }
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 15_000, timeout: 5_000 },
        );
      }
    }, 8_000);

    return () => {
      if (activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId);
      clearInterval(heartbeat);
    };
  }, [nonce]);

  return { fix, denied, loading, error, refresh, locate, locateByIp };
}
