/**
 * Stage 7B — browser geolocation capture for login security.
 *
 * This is a user-consented security/audit signal, NOT a fraud-proof control:
 * coordinates can be denied, spoofed, or coarse. We never derive a city/state
 * on the client and never fall back to a fake location — a denial is surfaced
 * honestly so the login screen can react (block when required, or continue when
 * not).
 */

export type GeoStatus =
  | 'idle'
  | 'prompting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'timeout'
  | 'error';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Request the current position once. Rejects with a `{ status }` shaped object
 * so callers can map the failure to a precise GeoStatus without depending on
 * the raw GeolocationPositionError numeric codes.
 */
export function getCurrentLocation(timeoutMs = 15000): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({ status: 'unsupported' as GeoStatus });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        const status: GeoStatus =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'error';
        reject({ status });
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
