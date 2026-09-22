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
  /// Present on every entry the timesheet screens read.
  payroll?: PayrollState;
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

/// Somebody the rota puts over forty hours in a week. Scheduled hours, not
/// worked ones, and counted across every location — see the server for why.
export interface OvertimeWarning {
  employeeId: string;
  employeeName: string;
  weekStart: string;
  scheduledHours: number;
  overtimeHours: number;
  /// Some of the week's hours are at a location this screen is not showing.
  spansLocations: boolean;
}

export interface Coverage {
  days: CoverageDay[];
  overtime: OvertimeWarning[];
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

export interface ChecklistTask {
  id: string;
  checklistId: string;
  position: number;
  title: string;
  description: string | null;
  owner: TaskOwner;
  dueAt: string | null;
  status: ChecklistTaskStatus;
  note: string | null;
  completedAt: string | null;
  completedBy: { id: string; firstName: string; lastName: string } | null;
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
  dueOffsetDays?: number;
}

// ---------------------------------------------------------------------------
// Payroll export
// ---------------------------------------------------------------------------

/// Where hours can be sent. Targets that are not ready say why.
export interface PayrollTarget {
  key: string;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
}

export type PayrollExportStatus = 'GENERATED' | 'FAILED' | 'VOIDED';

/// One run, as the history shows it.
export interface PayrollExportRecord {
  id: string;
  target: string;
  status: PayrollExportStatus;
  periodStart: string;
  periodEnd: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  entryCount: number;
  employeeCount: number;
  totalHours: number;
  failureReason: string | null;
  generatedAt: string;
  fileAvailable: boolean;
  location: { id: string; name: string } | null;
  generatedBy: { id: string; firstName: string; lastName: string } | null;
}

/// Whether these hours have already gone to payroll, and whether they have been
/// corrected since. Worked out by the server; see apps/api/src/time-entries.
export interface PayrollState {
  exported: boolean;
  exportedAt: string | null;
  exportId: string | null;
  changedSinceExport: boolean;
}

// ---------------------------------------------------------------------------
// Licences and certifications
// ---------------------------------------------------------------------------

export type CredentialKind =
  | 'LICENSE'
  | 'CERTIFICATION'
  | 'LIFE_SUPPORT'
  | 'REGISTRATION'
  | 'IMMUNIZATION'
  | 'BACKGROUND_CHECK'
  | 'OTHER';

export interface Credential {
  id: string;
  kind: CredentialKind;
  name: string;
  issuer: string | null;
  issuedOn: string | null;
  expiresOn: string;
  notes: string | null;
  archivedAt: string | null;
  /// Negative once it has lapsed; zero on the day it runs out, which still
  /// counts as valid.
  daysUntilExpiry: number;
  expired: boolean;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    employmentStatus: string;
  };
  recordedBy: { id: string; firstName: string; lastName: string } | null;
}
