const EARTH_RADIUS_METERS = 6_371_008.8;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres (haversine).
 *
 * Accurate to well within a metre at the distances we care about (a geofence
 * radius of tens to hundreds of metres), which is far finer than consumer GPS.
 */
export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
