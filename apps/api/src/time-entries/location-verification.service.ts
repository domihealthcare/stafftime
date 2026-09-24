import { Injectable } from '@nestjs/common';
import { ClockMethod, VerificationMethod } from '@prisma/client';
import { feetToMetres, metresToWholeFeet } from '../common/util/distance.util';
import { distanceInMeters, isValidLatitude, isValidLongitude } from '../common/util/geo.util';
import { isIpAllowed } from '../common/util/ip.util';

/// The location fields needed to verify a punch, with coordinates already
/// converted from Prisma's Decimal to plain numbers.
export interface VerifiableLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusFeet: number;
  allowedIps: string[];
  kioskEnabled: boolean;
  isActive: boolean;
}

export interface PunchAttempt {
  method: ClockMethod;
  location: VerifiableLocation;
  /// Whether the employee is assigned to this location.
  isAssignedToLocation: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  ipAddress?: string | null;
}

export type VerificationOutcome =
  | { allowed: true; verificationMethod: VerificationMethod; distanceMeters: number | null }
  | { allowed: false; reason: string };

/**
 * Decides whether a punch may be accepted, and records how it was proven.
 *
 * This is deliberately a pure decision function: it takes everything it needs as
 * input and returns a verdict rather than touching the database or throwing, so
 * the rules can be unit-tested exhaustively.
 *
 * Order of proof for a web/mobile punch:
 *   1. browser geolocation inside the location's geofence  -> GEOFENCE
 *   2. request IP on the location's allow-list (fallback)  -> IP_ALLOWLIST
 * A kiosk punch needs neither — the device itself is bound to the location.
 */
@Injectable()
export class LocationVerificationService {
  /**
   * A GPS fix whose own reported accuracy is wider than this multiple of the
   * geofence cannot meaningfully prove presence, so it is not trusted and we fall
   * through to the IP check.
   *
   * TODO: tune once we have real readings from both offices — indoor fixes are
   * often poor, and too strict a value here means staff cannot clock in at their desk.
   */
  private static readonly ACCURACY_TOLERANCE_MULTIPLIER = 2;

  verify(attempt: PunchAttempt): VerificationOutcome {
    const { location, method } = attempt;

    if (!location.isActive) {
      return { allowed: false, reason: `${location.name} is not an active location.` };
    }

    if (!attempt.isAssignedToLocation) {
      return {
        allowed: false,
        reason: `Employee is not assigned to ${location.name}.`,
      };
    }

    if (method === ClockMethod.KIOSK) {
      if (!location.kioskEnabled) {
        return { allowed: false, reason: `Kiosk mode is not enabled for ${location.name}.` };
      }
      // The kiosk session is already bound to this location, so presence is implied.
      return { allowed: true, verificationMethod: VerificationMethod.KIOSK, distanceMeters: null };
    }

    const geo = this.checkGeofence(attempt);
    if (geo.insideFence) {
      return {
        allowed: true,
        verificationMethod: VerificationMethod.GEOFENCE,
        distanceMeters: geo.distanceMeters,
      };
    }

    if (isIpAllowed(attempt.ipAddress, location.allowedIps)) {
      return {
        allowed: true,
        verificationMethod: VerificationMethod.IP_ALLOWLIST,
        distanceMeters: geo.distanceMeters,
      };
    }

    return { allowed: false, reason: geo.reason };
  }

  private checkGeofence(attempt: PunchAttempt): {
    insideFence: boolean;
    distanceMeters: number | null;
    reason: string;
  } {
    const { latitude, longitude, accuracyMeters, location } = attempt;

    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      return {
        insideFence: false,
        distanceMeters: null,
        reason:
          'Location sharing is required to clock in from a browser. Allow location access and try again, or use the front-desk kiosk.',
      };
    }

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return {
        insideFence: false,
        distanceMeters: null,
        reason: 'The coordinates reported by your device are not valid.',
      };
    }

    const distance = distanceInMeters(
      { latitude, longitude },
      { latitude: location.latitude, longitude: location.longitude },
    );

    // Both sides in metres. The radius is stored in feet, so converting it here
    // is not optional tidiness: comparing a metre accuracy against a foot radius
    // would silently make this check three times stricter than intended.
    const accuracyLimit =
      feetToMetres(location.geofenceRadiusFeet) *
      LocationVerificationService.ACCURACY_TOLERANCE_MULTIPLIER;
    if (accuracyMeters !== null && accuracyMeters !== undefined && accuracyMeters > accuracyLimit) {
      return {
        insideFence: false,
        distanceMeters: distance,
        reason:
          'Your device could not determine your location precisely enough to confirm you are on site. Try again outdoors or use the front-desk kiosk.',
      };
    }

    if (distance <= feetToMetres(location.geofenceRadiusFeet)) {
      return { insideFence: true, distanceMeters: distance, reason: '' };
    }

    return {
      insideFence: false,
      distanceMeters: distance,
      reason: `You appear to be about ${metresToWholeFeet(distance)} feet from ${location.name}, outside the ${location.geofenceRadiusFeet} foot clock-in area.`,
    };
  }
}
