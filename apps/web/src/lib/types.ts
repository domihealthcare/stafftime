// Mirrors the API's Prisma enums and response shapes.
// TODO: generate these from the API instead of hand-maintaining them once the
// contract settles — a drift here is a runtime bug the compiler cannot catch.

export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type EmploymentStatus = 'PENDING' | 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type ClockMethod = 'WEB' | 'MOBILE' | 'KIOSK';
export type VerificationMethod = 'GEOFENCE' | 'IP_ALLOWLIST' | 'KIOSK' | 'MANUAL' | 'REMOTE';
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
  geofenceRadiusFeet: number;
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
  geofenceRadiusFeet?: number;
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
  pronouns?: string | null;
  /// When their profile photo last changed; null for none.
  photoUpdatedAt?: string | null;
  externalId?: string | null;
  /// ADP TotalSource's File # — needed before their hours can go in the ADP
  /// import file.
  adpFileNumber?: string | null;
  /// True while an admin-set temporary password is still in force.
  mustChangePassword?: boolean;
  /// Whether this manager gets the nightly round-up. Ignored for employees,
  /// who are never sent it.
  wantsDailyDigest?: boolean;
  lastLoginAt?: string | null;
  locations: { locationId: string; isPrimary: boolean; location: LocationSummary }[];
}

export interface Shift {
  id: string;
  /// Null for an open shift: a slot nobody is on yet.
  employeeId: string | null;
  locationId: string;
  /// What job the shift is for, when that matters.
  jobRoleId?: string | null;
  /// Worked from home: clocking in during it needs no office check.
  isRemote?: boolean;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  notes: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    photoUpdatedAt?: string | null;
  } | null;
  location?: LocationSummary;
  jobRole?: { id: string; name: string; colour: string } | null;
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
  /// Anyone the new shifts leave past the overtime line, in the weeks touched.
  overtime: OvertimeWarning[];
}

export interface CoverageShift {
  id: string;
  /// Null for an open shift.
  employeeId: string | null;
  employeeName: string | null;
  jobRoleName: string | null;
  locationName: string;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  /// Scheduled while on approved leave — nearly always a mistake.
  conflictsWithLeave: boolean;
  /// Scheduled when they said they cannot work, described ("Not available
  /// Tuesdays, 5:00 PM–9:00 PM"). A warning, not a refusal.
  unavailable: string | null;
}

export interface CoverageDay {
  date: string;
  weekday: number;
  shifts: CoverageShift[];
  staffedHours: number;
  peopleScheduled: number;
  /// Shifts that day nobody is on yet.
  openShifts: number;
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

/// Past the overtime line; within a few hours of it; or neither.
export type OvertimeLevel = 'over' | 'near' | 'ok';

/// What one shift would do to somebody's week, asked before it is saved.
export interface OvertimeCheck {
  /// Salaried staff are never warned about.
  hourly: boolean;
  weekStart: string;
  hoursBefore: number;
  hoursAfter: number;
  thresholdHours: number;
  level: OvertimeLevel;
}

/// One of your own coming weeks that your published rota puts past the
/// overtime line.
export interface OwnOvertimeWeek {
  weekStart: string;
  scheduledHours: number;
  thresholdHours: number;
  overtimeHours: number;
}

/// What loading the demo data produced.
export interface DemoSummary {
  staffAdded: number;
  shifts: number;
  timeEntries: number;
  flaggedEntries: number;
  timeOffRequests: number;
  checklists: number;
  sharedPassword: string;
}

/// Practice-wide scheduling rules, set by an admin.
export interface PracticeSettings {
  overtimeThresholdHours: number;
  rotaWarningDays: number;
  /// Any day a pay period began (YYYY-MM-DD). Null until an admin sets it.
  payPeriodStart: string | null;
  updatedAt: string;
}

/// An inclusive range of calendar days, as YYYY-MM-DD.
export interface DayRange {
  from: string;
  to: string;
}

/// This pay period and the last, worked out by the server from the practice's
/// pay-period start. Both null until an admin sets that start.
export interface PayPeriodInfo {
  lengthDays: number;
  anchor: string | null;
  current: DayRange | null;
  previous: DayRange | null;
}

export interface Coverage {
  days: CoverageDay[];
  overtime: OvertimeWarning[];
  /// The line these warnings were worked out against. Sent rather than assumed,
  /// because the practice can change it.
  overtimeThresholdHours: number;
}

/// What the app knows needs a look, in the same words the nightly email uses —
/// it is the same list, read twice, so the screen and the email cannot
/// disagree. Each field is a set of ready-to-read lines.
export interface Attention {
  expiredCredentials: string[];
  expiringCredentials: string[];
  overdueTasks: string[];
  missingPunches: string[];
  undecidedTimeOff: string[];
  silentKiosks: string[];
  unpublishedRota: string[];
  unapprovedHours: string[];
  shiftsForLeavers: string[];
  openShifts: string[];
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
// Licenses and certifications
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

export interface Announcement {
  id: string;
  title: string;
  /// Plain text; line breaks are meaningful.
  body: string;
  /// Exactly one post is primary while any exist.
  isPrimary: boolean;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; preferredName: string | null } | null;
}

export interface PersonName {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
}

/// What somebody does at the practice. Decides which resources they see —
/// never what they may do in the app, which is `Employee.role`.
export interface JobRole {
  id: string;
  name: string;
  description: string | null;
  /// A key from JOB_ROLE_COLOURS.
  colour: string;
  sortOrder: number;
  resourceCount: number;
  members: PersonName[];
}

export type ResourceKind = 'LINK' | 'PAGE';

export interface Resource {
  id: string;
  jobRoleId: string | null;
  kind: ResourceKind;
  title: string;
  url: string | null;
  body: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface ResourceSection {
  /// Null is the section everybody sees.
  jobRole: { id: string; name: string; description: string | null; colour: string } | null;
  /// Whether the viewer is in this role.
  yours: boolean;
  resources: Resource[];
}

export interface DirectoryEntry {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  pronouns: string | null;
  about: string | null;
  photoUpdatedAt: string | null;
  email: string;
  phone: string | null;
  onLeave: boolean;
  jobRoles: { id: string; name: string; colour: string }[];
  locations: { id: string; name: string; isPrimary: boolean }[];
  /// Clocked in now. `since` is only sent to managers.
  onNow: { location: { id: string; name: string }; remote?: boolean; since?: string } | null;
}

export type UnavailabilityKind = 'WEEKLY' | 'ONE_OFF';

export interface UnavailabilityRule {
  id: string;
  kind: UnavailabilityKind;
  /// ISO weekday, 1 = Monday. WEEKLY only.
  weekday: number | null;
  /// YYYY-MM-DD. ONE_OFF only.
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  description: string;
  /// A one-off inside a published week: fixed.
  locked: boolean;
}

export interface MyAvailability {
  /// The first day a change can touch — the weeks before it are published.
  firstOpenDate: string;
  rules: UnavailabilityRule[];
}

export interface TeamAvailability extends PersonName {
  rules: UnavailabilityRule[];
}

export type SurveyAudience = 'EVERYONE' | 'JOB_ROLE' | 'LOCATION';
export type SurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED';
export type SurveyQuestionKind = 'RATING' | 'CHOICE' | 'TEXT';

export interface SurveyQuestion {
  id: string;
  position: number;
  kind: SurveyQuestionKind;
  prompt: string;
  options: string[];
}

export interface Survey {
  id: string;
  title: string;
  intro: string | null;
  audience: SurveyAudience;
  status: SurveyStatus;
  openedAt: string | null;
  closedAt?: string | null;
  jobRole: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  questions: SurveyQuestion[];
  answered: boolean;
  /// Managers only.
  responses?: number;
  audienceSize?: number;
  canAnswer?: boolean;
}

export interface SurveyInputQuestion {
  kind: SurveyQuestionKind;
  prompt: string;
  options?: string[];
}

export type SurveyResults =
  | { available: false; reason: string; responses: number }
  | {
      available: true;
      responses: number;
      questions: (SurveyQuestion & {
        answered: number;
        average?: number | null;
        counts?: number[];
        texts?: string[];
      })[];
    };

export interface FeedbackMessage {
  id: string;
  message: string;
  receivedOn: string;
  archivedAt: string | null;
}

export interface DashboardFigures {
  workedHours: number;
  scheduledHours: number;
  punches: number;
  late: number;
  earlyDepartures: number;
  timeOffDays: number;
}

export interface DashboardWeek {
  weekStart: string;
  byLocation: (DashboardFigures & { locationId: string })[];
  total: DashboardFigures & { overtimeHours: number };
  timeOffByType: Partial<Record<PtoType, number>>;
  overtime: { name: string; hours: number; overtimeHours: number }[];
}

export interface Dashboard {
  today: string;
  overtimeThresholdHours: number;
  locations: { id: string; name: string }[];
  weeks: DashboardWeek[];
  upcoming: {
    clashes: { date: string; employeeName: string; locationName: string; reason: string }[];
    overtime: OvertimeWarning[];
  };
}

/// Your own profile, as the Profile screen shows it.
export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  pronouns: string | null;
  email: string;
  phone: string | null;
  about: string | null;
  photoUpdatedAt: string | null;
  /// Whether a tablet PIN is set, and when it last changed. The PIN itself is
  /// never sent: it is only ever stored hashed.
  hasPin: boolean;
  pinUpdatedAt: string | null;
  role: Role;
  jobRoles: { id: string; name: string; colour: string }[];
  locations: { id: string; name: string; isPrimary: boolean }[];
}
