// Mirrors the API's Prisma enums and response shapes.
// TODO: generate these from the API instead of hand-maintaining them once the
// contract settles — a drift here is a runtime bug the compiler cannot catch.

export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type EmploymentStatus = 'PENDING' | 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type ClockMethod = 'WEB' | 'MOBILE' | 'KIOSK';
export type VerificationMethod = 'GEOFENCE' | 'IP_ALLOWLIST' | 'KIOSK' | 'MANUAL';
export type TimeEntryStatus = 'OPEN' | 'COMPLETED' | 'NEEDS_REVIEW' | 'APPROVED';
export type ShiftStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export interface LocationSummary {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
}

export interface Location extends LocationSummary {
  addressLine1: string;
  city: string;
  state: string;
  geofenceRadiusMeters: number;
  allowedIps: string[];
  kioskEnabled: boolean;
  isActive: boolean;
}

export interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  employmentStatus: EmploymentStatus;
}

export interface Employee extends EmployeeSummary {
  /// Whether a kiosk PIN is set. The PIN itself is never sent to the client.
  hasKioskPin?: boolean;
  preferredName: string | null;
  externalId?: string | null;
  /// True while an admin-set temporary password is still in force.
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  locations: { locationId: string; isPrimary: boolean; location: LocationSummary }[];
}

export interface Shift {
  id: string;
  employeeId: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  notes: string | null;
  employee?: { id: string; firstName: string; lastName: string };
  location?: LocationSummary;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  locationId: string;
  shiftId: string | null;
  method: ClockMethod;
  status: TimeEntryStatus;
  clockInAt: string;
  clockInVerification: VerificationMethod;
  clockOutAt: string | null;
  clockOutVerification: VerificationMethod | null;
  isLate: boolean;
  isEarlyDeparture: boolean;
  isManuallyEdited: boolean;
  isMissingPunch: boolean;
  editReason: string | null;
  employee?: { id: string; firstName: string; lastName: string };
  location?: LocationSummary;
  shift?: { id: string; startsAt: string; endsAt: string } | null;
}
