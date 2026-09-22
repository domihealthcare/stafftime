import { ClockMethod, VerificationMethod } from '@prisma/client';
import {
  LocationVerificationService,
  PunchAttempt,
  VerifiableLocation,
} from './location-verification.service';

describe('LocationVerificationService', () => {
  let service: LocationVerificationService;

  const northBergen: VerifiableLocation = {
    id: 'loc-nb',
    name: 'North Bergen',
    latitude: 40.804,
    longitude: -74.012,
    // 492 ft is 150 m — the value the migration converts the old default to,
    // kept here so the distances the rest of this file reasons about still mean
    // what their comments say.
    geofenceRadiusFeet: 492,
    allowedIps: ['203.0.113.0/24'],
    kioskEnabled: true,
    isActive: true,
  };

  /// A point ~1.8km away — the other office.
  const westNewYorkCoords = { latitude: 40.7878, longitude: -74.0143 };
  /// A point ~55m from the North Bergen pin, well inside the fence.
  const insideFence = { latitude: 40.8045, longitude: -74.012 };

  const attempt = (overrides: Partial<PunchAttempt> = {}): PunchAttempt => ({
    method: ClockMethod.WEB,
    location: northBergen,
    isAssignedToLocation: true,
    ...overrides,
  });

  beforeEach(() => {
    service = new LocationVerificationService();
  });

  describe('preconditions', () => {
    it('rejects an inactive location', () => {
      const result = service.verify(
        attempt({ location: { ...northBergen, isActive: false }, ...insideFence }),
      );
      expect(result).toEqual({ allowed: false, reason: expect.stringContaining('not an active') });
    });

    it('rejects an employee not assigned to the location', () => {
      const result = service.verify(attempt({ isAssignedToLocation: false, ...insideFence }));
      expect(result).toEqual({
        allowed: false,
        reason: expect.stringContaining('not assigned'),
      });
    });
  });

  describe('kiosk punches', () => {
    it('allows a kiosk punch with no geolocation at all', () => {
      const result = service.verify(attempt({ method: ClockMethod.KIOSK }));
      expect(result).toEqual({
        allowed: true,
        verificationMethod: VerificationMethod.KIOSK,
        distanceMeters: null,
      });
    });

    it('rejects a kiosk punch where kiosk mode is disabled', () => {
      const result = service.verify(
        attempt({ method: ClockMethod.KIOSK, location: { ...northBergen, kioskEnabled: false } }),
      );
      expect(result).toEqual({
        allowed: false,
        reason: expect.stringContaining('Kiosk mode is not enabled'),
      });
    });
  });

  describe('geofence', () => {
    it('allows a punch inside the radius', () => {
      const result = service.verify(attempt(insideFence));
      expect(result.allowed).toBe(true);
      expect(result).toMatchObject({ verificationMethod: VerificationMethod.GEOFENCE });
    });

    it('allows a punch exactly at the location pin', () => {
      const result = service.verify(
        attempt({ latitude: northBergen.latitude, longitude: northBergen.longitude }),
      );
      expect(result).toMatchObject({
        allowed: true,
        verificationMethod: VerificationMethod.GEOFENCE,
        distanceMeters: 0,
      });
    });

    it('treats the radius as feet, not as metres', () => {
      // The one mistake this conversion invites: reading 492 as metres, which
      // would make the fence three times too big. Every other case in this file
      // passes either way — the other office is 1.8km out and the inside point
      // is 55m in — so this is the point that tells them apart. 250m is outside
      // a 492 ft (150 m) fence and comfortably inside a 492 m one.
      const justOutside = { latitude: 40.806246, longitude: -74.012 };
      const result = service.verify(attempt({ ...justOutside, accuracyMeters: 20 }));

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toMatch(/outside the 492 foot clock-in area/);
      }
    });

    it('rejects a punch from the other office and says how far away it is', () => {
      const result = service.verify(attempt(westNewYorkCoords));
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toMatch(/outside the 492 foot clock-in area/);
      }
    });

    it('asks for location access when no coordinates are supplied', () => {
      const result = service.verify(attempt());
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toMatch(/Location sharing is required/);
      }
    });

    it('rejects impossible coordinates', () => {
      const result = service.verify(attempt({ latitude: 91, longitude: 0 }));
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toMatch(/not valid/);
      }
    });

    it('does not trust a fix whose accuracy is wider than twice the geofence', () => {
      const result = service.verify(
        attempt({ ...insideFence, accuracyMeters: 400, location: { ...northBergen, allowedIps: [] } }),
      );
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toMatch(/precisely enough/);
      }
    });

    it('still trusts a fix whose accuracy is within tolerance', () => {
      const result = service.verify(attempt({ ...insideFence, accuracyMeters: 40 }));
      expect(result).toMatchObject({
        allowed: true,
        verificationMethod: VerificationMethod.GEOFENCE,
      });
    });
  });

  describe('IP allow-list fallback', () => {
    it('allows an office IP when geolocation is unavailable', () => {
      const result = service.verify(attempt({ ipAddress: '203.0.113.9' }));
      expect(result).toMatchObject({
        allowed: true,
        verificationMethod: VerificationMethod.IP_ALLOWLIST,
      });
    });

    it('allows an office IP even when the GPS fix looks off-site', () => {
      // Wi-Fi-derived coordinates are sometimes badly wrong indoors; being on the
      // office network is the stronger signal.
      const result = service.verify(attempt({ ...westNewYorkCoords, ipAddress: '203.0.113.9' }));
      expect(result).toMatchObject({
        allowed: true,
        verificationMethod: VerificationMethod.IP_ALLOWLIST,
      });
    });

    it('rejects an off-site IP with no usable geolocation', () => {
      const result = service.verify(attempt({ ipAddress: '198.51.100.4' }));
      expect(result.allowed).toBe(false);
    });

    it('prefers GEOFENCE over IP_ALLOWLIST when both would pass', () => {
      const result = service.verify(attempt({ ...insideFence, ipAddress: '203.0.113.9' }));
      expect(result).toMatchObject({ verificationMethod: VerificationMethod.GEOFENCE });
    });
  });

  describe('mobile punches', () => {
    it('follows the same rules as web', () => {
      const result = service.verify(attempt({ method: ClockMethod.MOBILE, ...insideFence }));
      expect(result).toMatchObject({
        allowed: true,
        verificationMethod: VerificationMethod.GEOFENCE,
      });
    });
  });
});
