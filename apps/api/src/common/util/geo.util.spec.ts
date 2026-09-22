import { distanceInMeters, isValidLatitude, isValidLongitude } from './geo.util';

describe('distanceInMeters', () => {
  const northBergen = { latitude: 40.804, longitude: -74.012 };

  it('is zero for the same point', () => {
    expect(distanceInMeters(northBergen, northBergen)).toBe(0);
  });

  it('is symmetric', () => {
    const other = { latitude: 40.7878, longitude: -74.0143 };
    expect(distanceInMeters(northBergen, other)).toBeCloseTo(
      distanceInMeters(other, northBergen),
      6,
    );
  });

  it('measures a known short north-south hop', () => {
    // 0.001 degrees of latitude is ~111.2m anywhere on Earth.
    const justNorth = { latitude: northBergen.latitude + 0.001, longitude: northBergen.longitude };
    expect(distanceInMeters(northBergen, justNorth)).toBeGreaterThan(110);
    expect(distanceInMeters(northBergen, justNorth)).toBeLessThan(113);
  });

  it('measures the distance between the two Domi locations', () => {
    const westNewYork = { latitude: 40.7878, longitude: -74.0143 };
    const distance = distanceInMeters(northBergen, westNewYork);
    // The offices are roughly 1.8km apart — comfortably outside each other's geofence.
    expect(distance).toBeGreaterThan(1500);
    expect(distance).toBeLessThan(2200);
  });

  it('handles the antimeridian without blowing up', () => {
    const west = { latitude: 0, longitude: 179.999 };
    const east = { latitude: 0, longitude: -179.999 };
    expect(distanceInMeters(west, east)).toBeLessThan(500);
  });
});

describe('coordinate validation', () => {
  it.each([
    [0, true],
    [90, true],
    [-90, true],
    [90.1, false],
    [Number.NaN, false],
  ])('isValidLatitude(%s) === %s', (value, expected) => {
    expect(isValidLatitude(value)).toBe(expected);
  });

  it.each([
    [0, true],
    [180, true],
    [-180, true],
    [180.1, false],
    [Number.POSITIVE_INFINITY, false],
  ])('isValidLongitude(%s) === %s', (value, expected) => {
    expect(isValidLongitude(value)).toBe(expected);
  });
});
