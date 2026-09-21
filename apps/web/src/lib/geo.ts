const EARTH_RADIUS_METERS = 6_371_008.8;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/// Great-circle distance in metres. Used only to show an admin how far a newly
/// captured position is from the saved one — the authoritative check is the
/// server's.
export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  if (!Number.isFinite(from.latitude) || !Number.isFinite(from.longitude)) {
    return Number.NaN;
  }

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude));

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}
