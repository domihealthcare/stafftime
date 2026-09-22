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
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  timezone: string;
  /// Prisma sends Decimal columns as strings, to avoid float rounding.
  latitude: string;
  longitude: string;
  geofenceRadiusMeters: number;
  allowedIps: string[];
  kioskEnabled: boolean;
  isActive: boolean;
}

export interface UpdateLocationInput {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  allowedIps?: string[];
  kioskEnabled?: boolean;
  isActive?: boolean;
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

// ---------------------------------------------------------------------------
// PTO
// ---------------------------------------------------------------------------

export type PtoType = 'VACATION' | 'SICK' | 'PERSONAL' | 'BEREAVEMENT' | 'UNPAID' | 'OTHER';
export type PtoStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';

export interface PtoRequest {
  id: string;
  employeeId: string;
  type: PtoType;
  status: PtoStatus;
  /// Plain calendar dates, "2026-11-03" — not timestamps.
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  days: number;
  notes: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  employee?: { id: string; firstName: string; lastName: string; preferredName: string | null };
  reviewedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface ConflictingShift {
  id: string;
  startsAt: string;
  endsAt: string;
  location: { name: string };
}

export interface ReportPreset {
  id: string;
  name: string;
  isShared: boolean;
  isMine: boolean;
  ownerName: string;
  updatedAt: string;
}

export interface PtoPolicy {
  id: string;
  vacationDaysPerYear: number;
  sickDaysPerYear: number;
  maxCarryoverDays: number;
  sickCarryoverDays: number;
  yearStartMonth: number;
  yearStartDay: number;
  prorateFirstYear: boolean;
}

export interface AllowanceBalance {
  entitled: number;
  carriedOver: number;
  available: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface PtoBalance {
  employeeId: string;
  policyYear: number;
  yearStart: string;
  yearEnd: string;
  vacation: AllowanceBalance;
  sick: AllowanceBalance;
  unpaidAndOther: number;
}

export interface PlannedSkip {
  date: string;
  reason: 'OVERLAPS_SHIFT' | 'ON_APPROVED_LEAVE';
  detail: string;
}

export interface PlanResult {
  created: number;
  skipped: PlannedSkip[];
  dates: string[];
}

export interface CoverageShift {
  id: string;
  employeeId: string;
  employeeName: string;
  locationName: string;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  /// Scheduled while on approved leave — nearly always a mistake.
  conflictsWithLeave: boolean;
}

export interface CoverageDay {
  date: string;
  weekday: number;
  shifts: CoverageShift[];
  staffedHours: number;
  peopleScheduled: number;
  away: { employeeId: string; employeeName: string; type: PtoType }[];
}

// ---------------------------------------------------------------------------
// Onboarding / offboarding checklists
// ---------------------------------------------------------------------------

export type ChecklistKind = 'ONBOARDING' | 'OFFBOARDING';
export type TaskOwner = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type ChecklistTaskStatus = 'PENDING' | 'DONE' | 'NOT_APPLICABLE';

export interface ChecklistTemplateTask {
  id: string;
  position: number;
  title: string;
  description: string | null;
  owner: TaskOwner;
  requiresDocument: boolean;
  dueOffsetDays: number | null;
}

export interface ChecklistTemplate {
  id: string;
  kind: ChecklistKind;
  name: string;
  description: string | null;
  isDefault: boolean;
  archivedAt: string | null;
  tasks: ChecklistTemplateTask[];
}

/// What the screens are told about a document. Never the bytes — those come
/// from the download route, one file at a time.
export interface ChecklistDocument {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ChecklistTask {
  id: string;
  checklistId: string;
  position: number;
  title: string;
  description: string | null;
  owner: TaskOwner;
  requiresDocument: boolean;
  dueAt: string | null;
  status: ChecklistTaskStatus;
  note: string | null;
  completedAt: string | null;
  completedBy: { id: string; firstName: string; lastName: string } | null;
  documents: ChecklistDocument[];
}

export interface Checklist {
  id: string;
  kind: ChecklistKind;
  name: string;
  anchorDate: string;
  completedAt: string | null;
  createdAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    hireDate: string;
    terminationDate: string | null;
    employmentStatus: string;
  };
  tasks: ChecklistTask[];
  progress: { total: number; settled: number; pending: number; percent: number };
  overdueCount: number;
  nextTask: string | null;
}

/// A task as the template editor sends it back. No id: the list is replaced
/// whole, in the order given.
export interface TemplateTaskInput {
  title: string;
  description?: string;
  owner?: TaskOwner;
  requiresDocument?: boolean;
  dueOffsetDays?: number;
}
