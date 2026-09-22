export interface Position {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/// Thrown with a message written for the person holding the phone, not for a log.
export class GeolocationRefused extends Error {
  constructor(
    message: string,
    /// True when the browser will keep refusing until the user changes a setting,
    /// so the UI can offer the kiosk instead of just saying "try again".
    readonly needsPermissionChange: boolean,
  ) {
    super(message);
    this.name = 'GeolocationRefused';
  }
}

const TIMEOUT_MS = 15_000;

/**
 * Asks the browser where we are.
 *
 * The browser prompt only appears on a user gesture, so this must be called
 * directly from the clock-in click — not from an effect on page load.
 */
export function getCurrentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(
        new GeolocationRefused(
          'This browser cannot share your location. Use the front-desk kiosk to clock in.',
          true,
        ),
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          // Browsers report accuracy as a float; the API takes whole metres.
          accuracyMeters: Math.round(position.coords.accuracy),
        }),
      (error) => reject(translate(error)),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

function translate(error: GeolocationPositionError): GeolocationRefused {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationRefused(
        'Location access is blocked. Allow location for this site in your browser settings, or clock in at the front-desk kiosk.',
        true,
      );
    case error.POSITION_UNAVAILABLE:
      return new GeolocationRefused(
        'Your device could not determine its location. Try again near a window or outdoors, or use the front-desk kiosk.',
        false,
      );
    case error.TIMEOUT:
      return new GeolocationRefused(
        'Finding your location took too long. Try again, or use the front-desk kiosk.',
        false,
      );
    default:
      return new GeolocationRefused(
        'Could not read your location. Try again, or use the front-desk kiosk.',
        false,
      );
  }
}

/// Phones get MOBILE so the timesheet can tell a phone punch from a desktop one.
export function detectClockMethod(): 'WEB' | 'MOBILE' {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarsePointer ? 'MOBILE' : 'WEB';
}
