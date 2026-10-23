// Mirrors the API's Prisma enums and response shapes.
// TODO: generate these from the API instead of hand-maintaining them once the
// contract settles - a drift here is a runtime bug the compiler cannot catch.

export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type EmploymentStatus = 'PENDING' | 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type ClockMethod = 'WEB' | 'MOBILE' | 'KIOSK';
export type VerificationMethod = 'GEOFENCE' | 'IP_ALLOWLIST' | 'KIOSK' | 'MANUAL' | 'REMOTE';
export type TimeEntryStatus = 'OPEN' | 'COMPLETED' | 'NEEDS_REVIEW' | 'APPROVED';
/// Why a manager had to enter somebody's hours by hand.
export type HandEntryReason =
  'FORGOT' | 'APP_REFUSED' | 'NO_LOCATION_SHARING' | 'NO_PHONE' | 'OTHER';
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
  /// Whether they have chosen a password yet; if not, a welcome email is still worth sending.
  hasPassword?: boolean;
  /// Month and day only; never a year.
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  /// YYYY-MM-DD (as an ISO timestamp from the API), or null when not known.
  hireDate?: string | null;
  welcomeSentAt?: string | null;
  preferredName: string | null;
  /// Letters after their name ("MD", "APN-C"), for the clinical forms.
  postNominals?: string | null;
  pronouns?: string | null;
  /// Signed-in person only: the app's language for them.
  language?: 'en' | 'es';
  phone?: string | null;
  payType?: 'HOURLY' | 'SALARY';
  /// False for somebody who does not clock in (providers, to start with):
  /// Home shows their shift instead of a Clock in button, and the Directory
  /// shows them where their shift is while it runs. Set by an admin.
  clocksIn?: boolean;
  /// A shared account, not a person (October 2026): never clocks in, takes
  /// no time off, and is left out of the Directory, surveys and the rest.
  isSharedAccount?: boolean;
  /// Their last day, once they have left (or been given one).
  terminationDate?: string | null;
  /// When their profile photo last changed; null for none.
  photoUpdatedAt?: string | null;
  externalId?: string | null;
  /// ADP TotalSource's File # - needed before their hours can go in the ADP
  /// import file.
  adpFileNumber?: string | null;
  /// True while an admin-set temporary password is still in force.
  mustChangePassword?: boolean;
  /// Whether this manager gets the nightly round-up. Ignored for employees,
  /// who are never sent it.
  wantsDailyDigest?: boolean;
  /// "You're on tomorrow" the evening before a day they work. Their own.
  wantsShiftReminders?: boolean;
  /// "Your week" on Sunday evening. Their own.
  wantsWeeklySummary?: boolean;
  /// The parts of the round-up they leave out (`lib/digest-topics.ts`).
  mutedDigestTopics?: DigestTopic[];
  lastLoginAt?: string | null;
  locations: { locationId: string; isPrimary: boolean; location: LocationSummary }[];
  /// Signed-in person only: their job role shows them their own licenses and
  /// onboarding in the account menu (Providers).
  seesOwnPersonnelTabs?: boolean;
  /// Signed-in person only: their job role gives them the clinical forms
  /// in the account menu (Providers).
  usesClinicalForms?: boolean;
  /// Signed-in person only: their job role gives them the Annual Wellness
  /// Visit form (Providers and Medical Assistants).
  usesWellnessForm?: boolean;
  /// Signed-in person only: the built-in forms and guides they may open
  /// ('phone-book', 'braincheck', ...), as managers set them on Resources.
  tools?: string[];
  /// Signed-in person only: set while an admin is viewing the app as somebody
  /// else (October 2026) - their real access level and what they chose.
  /// `role` above is then the chosen one.
  viewingAs?: { actualRole: Role; role: Role; jobRoleIds: string[] | null } | null;
  /// Signed-in person only: a manager has published productivity numbers for
  /// them, so "Your productivity" appears in the account menu.
  hasProductivity?: boolean;
  /// Signed-in person only: their offices with a working time clock while they
  /// have no tablet PIN - Home reminds them. Empty once they have one.
  tabletPinOffices?: string[];
  /// Signed-in person only: an admin has given them provider productivity to
  /// work out and publish, whatever their access level.
  canManageProductivity?: boolean;
  /// Signed-in person only: an admin has chosen them to see the rota's cost.
  canSeeRotaCost?: boolean;
  /// An admin has switched on News posting for them (admins always can).
  canPostNews?: boolean;
  /// An admin has switched on the read-only whole schedule for them.
  canSeeEveryonesSchedule?: boolean;
}

/// `GET /schedule-view`: the whole published rota, read-only. Time off is a
/// bare range, never the kind.
export interface EveryonesSchedule {
  locations: { id: string; name: string; slug: string }[];
  people: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    photoUpdatedAt: string | null;
    locationIds: string[];
    jobRoles: { id: string; name: string }[];
  }[];
  shifts: {
    id: string;
    employeeId: string;
    locationId: string;
    isRemote: boolean;
    startsAt: string;
    endsAt: string;
    jobRole: { id: string; name: string; colour: string | null } | null;
  }[];
  off: { employeeId: string; startDate: string; endDate: string }[];
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
  /// The standing shift ("every Monday, no end date") it was made from.
  seriesId?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    photoUpdatedAt?: string | null;
  } | null;
  location?: LocationSummary;
  jobRole?: { id: string; name: string; colour: string } | null;
  /// "Running late" said for it, from Home.
  runningLate?: { minutes: number; createdAt: string } | null;
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
  /// Clocked in somewhere other than their shift - another office, or from
  /// home with no work-from-home shift - with the reason they gave, if any.
  isOtherPlace?: boolean;
  otherPlaceReason?: string | null;
  /// Still clocked in at midnight, so the app clocked them out then (October
  /// 2026). While `isMissingPunch` is also true, a manager still has to put
  /// in the real time, and it cannot be approved.
  autoClockedOutAt?: string | null;
  editReason: string | null;
  /// Set when a manager entered the whole day by hand - there was no punch.
  enteredByHandAt?: string | null;
  enteredBy?: { id: string; firstName: string; lastName: string } | null;
  handEntryReason?: HandEntryReason | null;
  handEntryNote?: string | null;
  /// When somebody looked into why it was needed; until then it is chased.
  handEntryCheckedAt?: string | null;
  handEntryCheckedBy?: { id: string; firstName: string; lastName: string } | null;
  handEntryFinding?: string | null;
  employee?: { id: string; firstName: string; lastName: string };
  location?: LocationSummary;
  shift?: {
    id: string;
    startsAt: string;
    endsAt: string;
    runningLate?: { minutes: number; createdAt: string } | null;
  } | null;
  /// A correction they asked for, still waiting for a manager.
  correctionRequests?: {
    id: string;
    clockInAt: string;
    clockOutAt: string;
    reason: string;
    createdAt: string;
  }[];
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
  /// Plain calendar dates, "2026-11-03" - not timestamps.
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  days: number;
  notes: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  employee?: { id: string; firstName: string; lastName: string; preferredName: string | null };
  reviewedBy?: { id: string; firstName: string; lastName: string } | null;
  /// Set when an admin wrote down time off already taken, rather than it
  /// being asked for (the back-log). Its comment is the reviewNote.
  recordedBy?: { id: string; firstName: string; lastName: string } | null;
  /// Asked for more than was left, knowing the rest may be unpaid.
  pastBalance?: boolean;
}

/// What a request would take and leave, before it is sent.
export interface TimeOffPreview {
  /// Weekdays, not days the office is shut.
  days: number;
  weekendDays: number;
  closedDays: string[];
  bucket: 'vacation' | 'sick' | null;
  policyYear: number;
  inOneYear: boolean;
  remaining: number | null;
  after: number | null;
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
  /// Hourly staff starting on or after this day earn sick time as they work
  /// ("2026-10-16T00:00:00.000Z"); null, nobody does.
  sickAccrualFrom: string | null;
}

export interface AllowanceBalance {
  entitled: number;
  carriedOver: number;
  available: number;
  used: number;
  /// Of `used`, days taken before Domi Staff, as a manager entered them.
  usedBefore: number;
  pending: number;
  remaining: number;
  /// Sick time earned as they work (hourly staff starting from the
  /// practice's date): what `entitled` came from.
  accrual?: { hoursWorked: number; hoursEarned: number; upToDays: number };
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

/// The days a manager can set for one person (the switch-over, September
/// 2026). Null allowance: the practice's. Null carry-over: worked out.
export interface PtoAdjustment {
  vacationDaysPerYear: number | null;
  sickDaysPerYear: number | null;
  vacationUsed: number;
  sickUsed: number;
  vacationCarriedOver: number | null;
  sickCarriedOver: number | null;
}

/// A row of the Time off screen's staff list, for managers.
export interface StaffBalance extends PtoAdjustment {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string;
  };
  balance: PtoBalance;
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
  /// A repeat with no end date: written out this far, and kept going nightly.
  standing?: { id: string; filledThrough: string };
  /// New hours for shifts already there: `created` counts the ones changed.
  action?: 'changed';
  /// A regular shift was changed too, so later weeks follow.
  regular?: boolean;
}

/// A regular shift with no end date - "Rosa, every Monday, 8 to 4". Its
/// shifts are written out eight weeks ahead and topped up every night.
export interface StandingShift {
  id: string;
  /// Null: open shifts, a slot to fill week after week.
  employeeId: string | null;
  locationId: string;
  /// 1 = Monday … 7 = Sunday.
  daysOfWeek: number[];
  /// 1 is every week; 2–4 every so many (see `lib/repeat-pattern.ts`).
  everyWeeks: number;
  /// Certain weeks of the month only: 1–4, -1 for the last. Empty: not.
  weeksOfMonth: number[];
  /// Every 2+ weeks: a date in a week it is on. Null: `startsOn`.
  cycleFrom: string | null;
  startTime: string;
  endTime: string;
  openCount: number;
  isRemote: boolean;
  status: ShiftStatus;
  startsOn: string;
  /// Set once it has been stopped: the last day it runs.
  endsOn: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  } | null;
  location: { id: string; name: string };
  jobRole: { id: string; name: string } | null;
}

/// What saving somebody's usual week did.
export interface WeeklyScheduleResult {
  from: string;
  created: number;
  removed: number;
  /// Regular shifts that already matched and were left alone.
  kept: number;
  skipped: PlanResult['skipped'];
  dates: string[];
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
  /// Scheduled while on approved leave - nearly always a mistake.
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
/// worked ones, and counted across every location - see the server for why.
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

/// "Who can cover this?" - somebody who could work a shift, ranked by the
/// server (`GET /shifts/:id/cover-options`).
export type CoverFit = 'good' | 'catch' | 'cannot';

export interface CoverReason {
  kind: 'shift' | 'leave' | 'asked-off' | 'availability' | 'overtime';
  text: string;
}

export interface CoverOption {
  employeeId: string;
  name: string;
  fit: CoverFit;
  hoursBefore: number;
  hoursAfter: number;
  hourly: boolean;
  overtime: OvertimeLevel;
  reasons: CoverReason[];
  sameDay: string[];
  current: boolean;
}

/// A first draft for one open shift: somebody free, or nobody.
export interface CoverProposal {
  shiftId: string;
  employeeId: string | null;
  name: string | null;
  hoursAfter: number | null;
}

export interface CoverOptions {
  weekStart: string;
  thresholdHours: number;
  options: CoverOption[];
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
export interface TestDataCounts {
  demoStaff: number;
  shifts: number;
  timeEntries: number;
  timeOffRequests: number;
  checklists: number;
  closingChecklists: number;
  restockRequests: number;
  licenses: number;
  availability: number;
  posts: number;
  surveys: number;
  events: number;
  productivityStatements: number;
  suggestions: number;
  notifications: number;
  payrollExports: number;
  savedReports: number;
}

export interface TestDataPreview {
  removing: TestDataCounts;
  keepingAccounts: { firstName: string; lastName: string; email: string; role: Role }[];
}

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

/// What the app knows needs a look, in the same words the nightly email uses -
/// it is the same list, read twice, so the screen and the email cannot
/// disagree. Each field is a set of ready-to-read lines.
export interface Attention {
  expiredCredentials: string[];
  expiringCredentials: string[];
  missingCredentials: string[];
  overdueTasks: string[];
  missingPunches: string[];
  missedShifts: string[];
  payrollDue: string[];
  correctionsAsked: string[];
  cmeWaiting: string[];
  regularShiftClashes: string[];
  belowMinimum: string[];
  undecidedTimeOff: string[];
  silentKiosks: string[];
  unpublishedRota: string[];
  unapprovedHours: string[];
  handEntries: string[];
  shiftsForLeavers: string[];
  openShifts: string[];
  shiftsInClosures: string[];
  closingGaps: string[];
  suppliesNeeded: string[];
  newSuggestions: string[];
  /// Dashboard and email only - never on a banner.
  punchPatterns: string[];
  /// Dashboard and email only - never on a banner.
  timeOffClashes: string[];
  /// Dashboard and email only - never on a banner.
  overtimeHeading: string[];
}

// ---------------------------------------------------------------------------
// Closing checklists - what Front Desk and MAs confirm at clock-out
// ---------------------------------------------------------------------------

export type ClosingItemKind = 'TASK' | 'REMINDER' | 'COUNT' | 'SUPPLY';

export interface ClosingItem {
  id: string;
  kind: ClosingItemKind;
  text: string;
  target: number | null;
}

/// A section as it applies to one clock-out: today's weekday and this office.
export interface ApplicableSection {
  id: string;
  title: string;
  isPosition: boolean;
  jobRole: string;
  items: ClosingItem[];
}

/// What gets sent with a clock-out. Ids and numbers only - nowhere to type.
export interface ClosingSubmission {
  skipped?: boolean;
  positions?: string[];
  done?: string[];
  counts?: { itemId: string; value: number }[];
  needed?: string[];
}

export interface ClosingTemplateItem extends ClosingItem {
  weekdays: number[];
  locationId: string | null;
  location: { id: string; name: string } | null;
  sortOrder: number;
}

export interface ClosingTemplateSection {
  id: string;
  title: string;
  isPosition: boolean;
  sortOrder: number;
  items: ClosingTemplateItem[];
}

export interface ClosingTemplateRole {
  id: string;
  name: string;
  colour: string;
  closingSections: ClosingTemplateSection[];
}

export interface ClosingAnswer {
  id: string;
  section: string;
  kind: ClosingItemKind;
  text: string;
  target: number | null;
  done: boolean | null;
  count: number | null;
  needed: boolean | null;
}

export interface ClosingRecord {
  id: string;
  day: string;
  employee: { id: string; firstName: string; preferredName: string | null; lastName: string };
  location: { id: string; name: string };
  clockInAt: string;
  clockOutAt: string | null;
  positions: string[];
  submitted: boolean;
  gaps: number;
  answers: ClosingAnswer[];
  /// Looked into and dealt with by one of the people who look after closing
  /// checklists; off the banner and the round-up from then.
  clearedAt: string | null;
  clearedBy: string | null;
  /// Whether the person asking may clear it: one of the people chosen, or
  /// anybody while nobody is.
  canClear: boolean;
}

export interface SupplyRequest {
  id: string;
  text: string;
  location: { id: string; name: string };
  firstAskedAt: string;
  lastAskedAt: string;
  timesAsked: number;
  lastAskedBy: string | null;
  orderedAt: string | null;
  orderedBy: string | null;
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
    hireDate: string | null;
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

/// A license or certificate the practice asks for, and which job roles need
/// it - required, or optional.
export interface CredentialType {
  id: string;
  name: string;
  kind: CredentialKind;
  /// How often it is renewed, in months; null when it varies.
  renewalMonths: number | null;
  sortOrder: number;
  archivedAt: string | null;
  requirements: {
    jobRoleId: string;
    required: boolean;
    jobRole: { id: string; name: string; colour: string };
  }[];
}

export type StandingState = 'CURRENT' | 'DUE_SOON' | 'EXPIRED' | 'MISSING';

/// One person against the licenses their job roles ask for.
export interface CredentialStanding {
  employee: { id: string; firstName: string; lastName: string; preferredName: string | null };
  lines: {
    type: { id: string; name: string; kind: CredentialKind; renewalMonths: number | null };
    required: boolean;
    /// Which of their job roles ask for it.
    forRoles: string[];
    credential: { id: string; expiresOn: string; daysUntilExpiry: number } | null;
    state: StandingState;
  }[];
}

export interface Announcement {
  id: string;
  title: string;
  /// Plain text; line breaks are meaningful.
  body: string;
  /// Exactly one post is primary while any exist.
  isPrimary: boolean;
  /// Shown publicly: on the front-desk time clock and the sign-in page.
  showOnTimeClock: boolean;
  /// The post in Spanish, when there is one (October 2026). The poll stays
  /// in English.
  titleEs: string | null;
  bodyEs: string | null;
  /// The Spanish is the AI service's, as it came.
  spanishByAi: boolean;
  editedAt: string | null;
  createdAt: string;
  author: PersonName | null;
  /// Everybody who liked it, by name - likes are named on purpose.
  likes: PersonName[];
  likedByMe: boolean;
  /// Oldest first, like a conversation.
  comments: AnnouncementComment[];
  poll: AnnouncementPoll | null;
}

export interface AnnouncementComment {
  id: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author: PersonName & { photoUpdatedAt: string | null };
}

/// A poll on a post. Votes are named: everybody sees who picked what.
export interface AnnouncementPoll {
  id: string;
  question: string;
  allowsMultiple: boolean;
  /// Set while voting is closed.
  closedAt: string | null;
  options: { id: string; label: string; voters: PersonName[] }[];
  /// People who have voted at all - on a tick-box poll, fewer than the votes.
  voterCount: number;
  /// The reader's own picks.
  myChoices: string[];
}

/// A poll as the admin writes it.
export interface PollInput {
  question: string;
  options: string[];
  allowsMultiple?: boolean;
}

export interface PersonName {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
}

/// What somebody does at the practice. Decides which resources they see -
/// never what they may do in the app, which is `Employee.role`.
export interface JobRole {
  id: string;
  name: string;
  description: string | null;
  /// A key from JOB_ROLE_COLOURS.
  colour: string;
  sortOrder: number;
  resourceCount: number;
  /// isPrimary: it is that person's main job role.
  members: (PersonName & { isPrimary?: boolean })[];
  /// People in it see their own licenses and onboarding in the account menu.
  seesOwnPersonnelTabs?: boolean;
  /// People in it get the clinical forms under Resources → Forms.
  usesClinicalForms?: boolean;
  /// People in it get the Annual Wellness Visit form under Resources → Forms.
  usesWellnessForm?: boolean;
  /// People in it see a rep's cell phone on a rep lunch (Front Desk).
  seesRepCell?: boolean;
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

/// What is in a Drive folder a link points at (September 2026).
export interface DriveFile {
  id: string;
  name: string;
  isFolder: boolean;
  /// Whether the app can hand it over: false for a Google Form, a shortcut or
  /// a file too large.
  canOpen: boolean;
  modifiedAt: string | null;
}

export type DriveFolderListing =
  | { status: 'ok'; files: DriveFile[] }
  | { status: 'off' | 'not-a-folder' }
  | { status: 'unreadable'; shareWith: string | null };

export interface ResourceSection {
  /// Null is the section everybody sees.
  jobRole: {
    id: string;
    name: string;
    description: string | null;
    colour: string;
    /// Its section carries the clinical forms (Provider).
    usesClinicalForms?: boolean;
    /// Its section carries the Annual Wellness Visit form (Medical Assistant).
    usesWellnessForm?: boolean;
  } | null;
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
  language: 'en' | 'es';
  photoUpdatedAt: string | null;
  email: string;
  phone: string | null;
  /// Month and day only; never a year.
  birthdayMonth: number | null;
  birthdayDay: number | null;
  onLeave: boolean;
  /// Their main job role first (isPrimary), then the practice's order.
  jobRoles: {
    id: string;
    name: string;
    colour: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }[];
  locations: { id: string; name: string; isPrimary: boolean }[];
  /// Clocked in now. `since` is only sent to managers. `jobRole` is the job
  /// role of the shift they clocked in to, if it has one. `scheduled`: they
  /// do not clock in, and this is the published shift they are on right now
  /// (`since` is then when it started).
  onNow: {
    location: { id: string; name: string };
    remote?: boolean;
    scheduled?: boolean;
    since?: string;
    jobRole?: { id: string; name: string; colour: string; sortOrder: number } | null;
  } | null;
  /// A published work-from-home shift today that has not ended yet.
  homeToday: { startsAt: string; endsAt: string } | null;
}

/// A line on the office extensions list: a person or a phone, in a section.
/// `homeExtension` rings the person's mobile on their work-from-home days.
export interface OfficeExtension {
  id: string;
  section: string;
  label: string;
  extension: string;
  homeExtension: string | null;
  homeDays: string | null;
  employeeId: string | null;
}

export type OfficeExtensionInput = Omit<OfficeExtension, 'id'>;

/// Somebody's birthday falling on `date` (YYYY-MM-DD) in the range asked for.
export interface BirthdayEntry {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  photoUpdatedAt: string | null;
  date: string;
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
  /// The first day a change can touch - the weeks before it are published.
  firstOpenDate: string;
  rules: UnavailabilityRule[];
}

export interface TeamAvailability extends PersonName {
  rules: UnavailabilityRule[];
}

export type SurveyAudience = 'EVERYONE' | 'JOB_ROLE' | 'LOCATION';

/// Who a practice event is for - the same three choices as a survey. A
/// closure is for both offices (EVERYONE) or one (LOCATION).
export type EventAudience = 'EVERYONE' | 'JOB_ROLE' | 'LOCATION' | 'CHOSEN';

/// One entry on a CHOSEN event's list: a person, a job role or an office.
export interface EventInvitee {
  type: 'EMPLOYEE' | 'JOB_ROLE' | 'LOCATION';
  id: string;
  name: string;
  /// A job role's colour key; null for the rest.
  colour: string | null;
}

export type RepeatFrequency = 'WEEKLY' | 'MONTHLY';
export type MonthlyRepeat = 'DAY_OF_MONTH' | 'WEEKDAY_OF_MONTH';

export interface RepeatInput {
  frequency: RepeatFrequency;
  interval: number;
  /// WEEKLY: 1 = Monday … 7 = Sunday.
  weekdays?: number[];
  monthlyMode?: MonthlyRepeat;
  /// WEEKDAY_OF_MONTH: 1–4, or -1 for the last.
  monthlyWeek?: number;
  /// "2026-12-31", the last date it may land on.
  until: string;
}

/// The series a repeating event's date belongs to.
export interface EventSeries extends RepeatInput {
  id: string;
  firstDate: string;
  /// "Every 2 weeks on Fri until Dec 31, 2026".
  summary: string;
}

/// What an entry on the practice calendar is: a meeting or day out, an
/// office shut, a named day that shuts nothing, when a test is offered, a
/// rep lunch, or when the phlebotomist is at an office.
export type EventKind = 'EVENT' | 'CLOSURE' | 'HOLIDAY' | 'DIAGNOSTIC' | 'REP_LUNCH' | 'PHLEBOTOMY';

/// How a rep feeds the office: they bring catering, or the office orders.
export type RepFood = 'CATERING' | 'SELF_ORDER';
/// Whether the practice wants a rep back.
export type RepStatus = 'PREFERRED' | 'OK' | 'RESTRICTED' | 'DO_NOT_BOOK';

/// A rep who books lunches, from Manage → Offices → Reps (managers and admins).
export interface Rep {
  id: string;
  name: string;
  company: string | null;
  medication: string | null;
  cellPhone: string | null;
  food: RepFood | null;
  status: RepStatus;
  notes: string | null;
  /// Their most recent lunch, and the next one booked.
  lastLunch: string | null;
  nextLunch: string | null;
}

export interface RepInput {
  name: string;
  company?: string;
  medication?: string;
  cellPhone?: string;
  food?: RepFood | null;
  status: RepStatus;
  notes?: string;
}

/// A rep lunch's rep. Staff get who, the company, the medication and the
/// food; job roles that see it (Front Desk) the cell phone; managers also the
/// status and notes.
export interface EventRep {
  id: string;
  name: string;
  company: string | null;
  medication: string | null;
  food: RepFood | null;
  cellPhone?: string | null;
  status?: RepStatus;
  notes?: string | null;
}

/// An office meeting, a provider meeting, a wellness day. On the schedule and
/// in the calendar feed; never counted as hours.
export interface PracticeEvent {
  id: string;
  kind: EventKind;
  title: string;
  description: string | null;
  place: string | null;
  /// A video call to join (Google Meet, Zoom, Teams); https only.
  meetingUrl: string | null;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  /// All-day events only: the first and last day, "2026-10-15", on the
  /// practice's clock. Null for a timed event.
  startDate: string | null;
  endDate: string | null;
  audience: EventAudience;
  jobRole: { id: string; name: string; colour: string } | null;
  location: { id: string; name: string } | null;
  /// A diagnostics date: the office it is at (it is for everyone).
  atLocation: { id: string; name: string } | null;
  /// A rep lunch: the rep (null once taken off the list).
  rep: EventRep | null;
  /// CHOSEN: who it is for.
  invitees: EventInvitee[];
  /// The series this date belongs to, if it repeats.
  series: EventSeries | null;
  /// A meeting: the viewer's own answer, if they gave one. Absent from a save.
  myReply?: ReplyAnswer | null;
}

/// Going, can't go or maybe - to a meeting (October 2026).
export type ReplyAnswer = 'GOING' | 'NOT_GOING' | 'MAYBE';

export interface ReplyPerson {
  id: string;
  name: string;
}

/// Who is going to a meeting, for everybody it is for.
export interface EventReplies {
  /// Whether the viewer is on the list and it has not happened yet.
  canReply: boolean;
  mine: ReplyAnswer | null;
  going: ReplyPerson[];
  maybe: ReplyPerson[];
  notGoing: ReplyPerson[];
  /// Not said yet.
  waiting: ReplyPerson[];
}

/// One suggested time from "Find a time".
export interface TimeSuggestion {
  startsAt: string;
  endsAt: string;
  total: number;
  /// On the rota for all of it.
  atWork: number;
  /// Free, but not on the rota then.
  notOnRota: string[];
  check: { name: string; why: string }[];
  busy: { name: string; why: string }[];
}

export interface FoundTimes {
  from: string;
  days: number;
  people: number;
  suggestions: TimeSuggestion[];
}

export interface EventInput {
  kind?: EventKind;
  /// Not sent for a rep lunch: it is named after its rep.
  title?: string;
  description?: string;
  place?: string;
  meetingUrl?: string;
  /// Have the server make a Google Meet link (hosted by the practice account).
  createMeetLink?: boolean;
  allDay: boolean;
  startsAt?: string;
  endsAt?: string;
  startDate?: string;
  endDate?: string;
  audience: EventAudience;
  jobRoleId?: string;
  locationId?: string;
  /// A diagnostics date: the office it is at.
  atLocationId?: string;
  /// A rep lunch: the rep. The title is made from their name.
  repId?: string;
  invitees?: { employeeIds?: string[]; jobRoleIds?: string[]; locationIds?: string[] };
  repeat?: RepeatInput | null;
  /// Closures and holidays, when making one: also on the same date in each
  /// of the next this-many years.
  yearsAhead?: number;
}
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

export type FeedbackKind = 'IDEA' | 'PROBLEM' | 'SHOUT_OUT' | 'QUESTION';

export interface FeedbackMessage {
  id: string;
  message: string;
  kind: FeedbackKind | null;
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

/// The Dashboard's "Across the practice": everything besides hours.
export interface PracticeOverview {
  surveys: {
    surveys: {
      id: string;
      title: string;
      status: 'DRAFT' | 'OPEN' | 'CLOSED';
      openedAt: string | null;
      closedAt: string | null;
      responses: number;
      audienceSize: number;
      /// Closed, and enough people answered for results to be shown.
      resultsShown: boolean;
    }[];
    suggestionsLast30Days: number;
  };
  licenses: {
    withinDays: number;
    expired: { employeeName: string; name: string; expiresOn: string; daysUntilExpiry: number }[];
    dueSoon: { employeeName: string; name: string; expiresOn: string; daysUntilExpiry: number }[];
    missingRequired: { employeeName: string; name: string }[];
  };
  checklists: {
    id: string;
    kind: 'ONBOARDING' | 'OFFBOARDING';
    name: string;
    employeeName: string;
    total: number;
    done: number;
    overdue: number;
  }[];
  closing: {
    days: number;
    total: number;
    complete: number;
    withGaps: number;
    skipped: number;
    suppliesToOrder: { office: string; count: number }[];
  };
  waiting: {
    timeOff: number;
    handEntries: number;
    unapprovedHours: number;
    missingPunches: number;
    missedShifts: number;
  };
  /// The same thing again and again in the last four weeks, for a quiet word.
  patterns: PunchPattern[];
  /// Too many from one job role off at once, the next `weeks` weeks.
  timeOffClashes: { weeks: number; clashes: TimeOffClash[] };
  /// Heading past the overtime line this week on hours actually worked plus
  /// what the rota still has them down for. See `time-entries/overtime-forecast.ts`.
  overtimeForecast: {
    weekStart: string;
    thresholdHours: number;
    people: OvertimeHeading[];
  };
}

export interface OvertimeHeading {
  employeeId: string;
  employeeName: string;
  worked: number;
  stillScheduled: number;
  projected: number;
  /// The whole week as the rota has it.
  rota: number;
}

/// Too many from one job role off on the same days at one office: more than
/// half of them, approved or asked for. See `pto/time-off-clashes.ts`.
export interface TimeOffClash {
  from: string;
  to: string;
  locationId: string;
  locationName: string;
  jobRoleId: string;
  jobRoleName: string;
  total: number;
  off: {
    employeeId: string;
    name: string;
    requestId: string;
    approved: boolean;
    isHalfDay: boolean;
  }[];
  /// The practice's minimum it falls below; null: more than half off.
  minimum: number | null;
}

export interface PunchPattern {
  employeeId: string;
  employeeName: string;
  kind: 'late' | 'missed-clock-out' | 'early';
  count: number;
  /// The days it happened, oldest first, as "YYYY-MM-DD".
  dates: string[];
  summary: string;
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
  birthdayMonth: number | null;
  birthdayDay: number | null;
  /// Whether a tablet PIN is set, and when it last changed. The PIN itself is
  /// never sent: it is only ever stored hashed.
  hasPin: boolean;
  pinUpdatedAt: string | null;
  role: Role;
  jobRoles: { id: string; name: string; colour: string }[];
  locations: { id: string; name: string; isPrimary: boolean }[];
}

/// How a provider's productivity is counted (September 2026). Every part is
/// optional; it only supplies defaults for the statements made under it.
export interface ProductivityPlan {
  employeeId: string;
  employee?: PersonName;
  intervalWeeks: number;
  intervalsPerStatement: number;
  expectedPerInterval: number | null;
  multiplier: number | null;
  categories: string[];
  carriesBalance: boolean;
}

export interface ProductivityCount {
  label: string;
  count: number;
}

export interface ProductivityInterval {
  id?: string;
  position: number;
  /// YYYY-MM-DD
  startDate: string;
  endDate: string;
  expected: number | null;
  counts: ProductivityCount[];
  actual: number;
}

export interface ProductivityTotals {
  expected: number | null;
  actual: number;
  difference: number | null;
  multiplierCents: number | null;
  amountCents: number | null;
}

export interface ProductivityStatement {
  id: string;
  employeeId: string;
  employee?: PersonName;
  startDate: string;
  endDate: string;
  multiplier: number | null;
  paidOn: string | null;
  note: string | null;
  /// A short period is carried forward and netted off the next ones.
  carriesBalance: boolean;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  intervals: ProductivityInterval[];
  totals: ProductivityTotals;
  balance: ProductivityBalance;
}

/// The running balance (September 2026): a shortfall brought in, what is paid
/// for this period once it is netted off, and any shortfall still standing.
export interface ProductivityBalance {
  carriedInCents: number;
  payableCents: number | null;
  carriedOutCents: number;
}

// ---------------------------------------------------------------------------
// Staff profiles - the admins-only record (October 2026)
// ---------------------------------------------------------------------------

export interface PersonalRecordFields {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
}

export interface PersonalRecord extends PersonalRecordFields {
  updatedAt: string | null;
  updatedBy: string | null;
}

export type EmploymentChangeKind =
  'HIRED' | 'PROMOTION' | 'PAY_CHANGE' | 'POSITION_CHANGE' | 'OTHER';
export type PayRateUnit = 'HOURLY' | 'YEARLY';

export interface EmploymentChangeInput {
  /// "2026-10-01"
  effectiveOn: string;
  kind: EmploymentChangeKind;
  position: string | null;
  payRate: number | null;
  payUnit: PayRateUnit | null;
  note: string | null;
}

export interface EmploymentChange extends EmploymentChangeInput {
  id: string;
  recordedBy: string | null;
  createdAt: string;
}

export interface StaffRecord {
  personal: PersonalRecord;
  /// Newest first.
  changes: EmploymentChange[];
  current: {
    position: { value: string; since: string } | null;
    pay: { rate: number; unit: PayRateUnit; since: string } | null;
  };
}

/// The parts of the nightly round-up a manager chooses between.
export type DigestTopic =
  | 'SCHEDULE'
  | 'TIME_OFF'
  | 'HOURS'
  | 'LICENSES'
  | 'CHECKLISTS'
  | 'CLOSING'
  | 'TIME_CLOCK'
  | 'SUGGESTIONS';

export interface DigestPreferences {
  wantsDailyDigest?: boolean;
  wantsShiftReminders?: boolean;
  wantsWeeklySummary?: boolean;
  mutedDigestTopics?: DigestTopic[];
}

/// A manager or admin on the "Who gets what" table.
export interface DigestReader {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  wantsDailyDigest: boolean;
  mutedDigestTopics: DigestTopic[];
}

/// "Before you publish" - see `shifts/publish-check.ts` in the API.
export interface PublishCheckSection {
  key:
    | 'licenses'
    | 'leavers'
    | 'leave'
    | 'closures'
    | 'availability'
    | 'overtime'
    | 'minimum'
    | 'open';
  title: string;
  lines: string[];
}

export interface PublishCheck {
  drafts: number;
  sections: PublishCheckSection[];
}

/// "Before you export" - see `exports/export-check.ts` in the API.
export interface ExportCheck {
  sections: {
    key: 'adp' | 'review' | 'open' | 'unapproved' | 'handEntries' | 'corrected' | 'overtime';
    title: string;
    lines: string[];
  }[];
}

/// Somebody's usual hours and place for a day, for a new shift to start on
/// (`GET /shifts/usual`): their regular shift, or what they have worked most
/// often lately.
export interface UsualShift {
  startTime: string;
  endTime: string;
  locationId: string;
  isRemote: boolean;
  jobRoleId: string | null;
  from: 'regular' | 'weekday' | 'recent';
}

/// The fewest the practice wants on in one job role at one office on an open
/// day (Job roles → Minimum on each day). None set: no row.
export interface StaffingMinimum {
  locationId: string;
  jobRoleId: string;
  minimum: number;
  /// The weekdays it applies, 1 = Monday ... 7 = Sunday; empty: every day.
  weekdays: number[];
}

/// A pasted booking read for the calendar's form (AI, October 2026). Empty or
/// null where the message did not say.
export interface ReadBooking {
  kind: EventKind;
  title: string;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  locationId: string | null;
  repId: string | null;
  /// A rep the message names who is not on the list yet.
  newRep: { name: string; company: string; medication: string } | null;
  place: string;
  description: string;
}

/// "Ask who can cover" (October 2026): where an open shift's asking stands.
export type CoverState = 'open' | 'yours' | 'covered' | 'stopped' | 'started';

export interface CoverRequestStatus {
  id: string;
  createdAt: string;
  state: CoverState;
  takenBy: PersonName | null;
  asks: {
    employee: PersonName & { id: string };
    answer: boolean | null;
    answeredAt: string | null;
  }[];
}

/// The shift as somebody asked to cover it sees it.
export interface CoverView {
  id: string;
  when: string;
  where: string;
  startsAt: string;
  endsAt: string;
  state: CoverState;
  myAnswer: boolean | null;
  asked: boolean;
}

/// Somebody still here who has never signed in (October 2026).
export interface NotSignedIn {
  id: string;
  name: string;
  email: string;
  standing:
    'not-invited' | 'link-waiting' | 'link-expired' | 'temporary-password' | 'password-not-used';
  welcomeSentAt: string | null;
  usesTimeClock: boolean;
  canSendWelcome: boolean;
}

// ------------------------------------------------- required reading and tasks

export type RequirementKind = 'READ' | 'TASK';

interface NamedPerson {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
}

/// Something a manager asked people to read and confirm, or to do.
export interface Requirement {
  id: string;
  kind: RequirementKind;
  title: string;
  body: string | null;
  url: string | null;
  /// "YYYY-MM-DD", or null for no due date.
  dueOn: string | null;
  everyone: boolean;
  closedAt: string | null;
  createdAt: string;
  createdBy: NamedPerson | null;
  announcement: { id: string; title: string } | null;
  resource: { id: string; title: string; kind: 'LINK' | 'PAGE' } | null;
  targets?: {
    employees: NamedPerson[];
    jobRoles: { id: string; name: string }[];
    locations: { id: string; name: string }[];
  };
}

/// One of yours: when you confirmed it, or null while it is waiting.
export interface MyRequirement extends Requirement {
  doneAt: string | null;
}

/// A manager's row: how many it is for, how many have confirmed.
export interface RequirementSummary extends Requirement {
  asked: number;
  done: number;
  overdue: boolean;
}

export interface RequirementProgress {
  requirement: Requirement;
  done: (NamedPerson & { doneAt: string })[];
  waiting: NamedPerson[];
}

export interface RequirementInput {
  kind: RequirementKind;
  title: string;
  body?: string;
  url?: string;
  announcementId?: string | null;
  resourceId?: string | null;
  dueOn?: string | null;
  everyone: boolean;
  targets?: { employeeIds: string[]; jobRoleIds: string[]; locationIds: string[] };
}

/// What the rota on screen costs - only for the people an admin has chosen.
export interface RotaCost {
  from: string;
  to: string;
  total: number;
  hourly: number;
  overtimeExtra: number;
  overtimeHours: number;
  salaried: number;
  scheduledHours: number;
  byLocation: { locationId: string | null; name: string; total: number; hours: number }[];
  byDay: { date: string; total: number }[];
  missingPay: { id: string; name: string }[];
}

// ------------------------------------------------------------- on call

export interface OnCallPerson {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  photoUpdatedAt: string | null;
  /// "Dr. Jonathan Dominguez".
  name: string;
}

export interface OnCallDay {
  date: string;
  employeeId: string | null;
  employee: OnCallPerson | null;
  /// The usual pattern, a manager's change, a swap - or nobody set.
  source: 'USUAL' | 'CHANGED' | 'SWAPPED' | 'NONE';
  /// "HH:MM": the turn runs from this on its date to this the next day.
  changesAt: string;
  note: string | null;
}

export interface OnCallSchedule {
  days: OnCallDay[];
  now: { date: string; employee: OnCallPerson | null; until: string };
  providers: OnCallPerson[];
}

/// Who reviews a provider's patient schedule on a day (October 2026). Only
/// who and which provider: the schedules themselves stay in eCW.
/// The groups of schedules and who reviews each, as on the practice's sheet.
export interface ScheduleReviewAreas {
  areas: { id: string; name: string; forResources: boolean; reviewer: OnCallPerson | null }[];
  /// Who can be picked: everybody still here.
  reviewers: OnCallPerson[];
}

/// `GET /calendar/providers`: published provider shifts, by office or
/// telemedicine (a work-from-home shift).
export interface ProviderPlaces {
  shifts: {
    id: string;
    provider: OnCallPerson;
    isRemote: boolean;
    locationId: string;
    locationName: string;
    startsAt: string;
    endsAt: string;
  }[];
}

export interface ScheduleReview {
  providerId: string;
  reviewer: OnCallPerson | null;
  /// The usual pattern, a manager's change for the day, or nobody set.
  source: 'USUAL' | 'CHANGED' | 'NONE';
  note: string | null;
}

export interface ScheduleReviewDays {
  providers: OnCallPerson[];
  days: { date: string; reviews: ScheduleReview[] }[];
}

export interface ScheduleReviewPattern {
  providers: OnCallPerson[];
  /// 1 = Monday … 7 = Sunday.
  entries: { providerId: string; weekday: number; reviewerId: string }[];
  /// Everybody still here, who can be picked.
  reviewers: OnCallPerson[];
}

export interface OnCallRota {
  startsOn: string;
  changesAt: string;
  inForce: boolean;
  entries: { weekday: number; weekOfMonth: number; employee: OnCallPerson }[];
}

export interface OnCallSwap {
  id: string;
  giveDate: string;
  takeDate: string | null;
  note: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  answeredAt: string | null;
  requester: OnCallPerson;
  partner: OnCallPerson;
}

// ---------------------------------------------------------------- 360 feedback

export type Review360QuestionKind = 'RATING' | 'TEXT';

export interface Review360QuestionInput {
  kind: Review360QuestionKind;
  prompt: string;
  selfPrompt?: string | null;
  hint?: string | null;
}

export interface Review360Question extends Review360QuestionInput {
  id: string;
}

/// A 360 in the list on Surveys: the person's own progress, and for managers
/// how many have taken part (never who).
export interface Review360Summary {
  id: string;
  title: string;
  status: 'OPEN' | 'CLOSED';
  closesOn: string | null;
  closedAt: string | null;
  createdAt: string;
  people: number;
  mine: { done: number; total: number; selfDone: boolean } | null;
  tookPart?: number;
}

export interface Review360Person {
  id: string;
  name: string;
  firstName: string;
  photoUpdatedAt: string | null;
  jobRole: string | null;
  isYou: boolean;
  state: 'todo' | 'done' | 'skipped';
}

export interface Review360Detail {
  id: string;
  title: string;
  intro: string | null;
  status: 'OPEN' | 'CLOSED';
  closesOn: string | null;
  closedAt: string | null;
  questions: Review360Question[];
  takingPart: boolean;
  people: Review360Person[];
  minRaters: number;
}

export interface ReviewMeeting {
  id: string;
  reviewId: string;
  reviewTitle: string;
  subject: { id: string; name: string };
  offeredBy: { id: string; name: string } | null;
  place: string | null;
  note: string | null;
  createMeetLink: boolean;
  eventId: string | null;
  chosenAt: string | null;
  createdAt: string;
  slots: { id: string; startsAt: string; endsAt: string; chosen: boolean }[];
}

export interface Review360ReportRow {
  id: string;
  name: string;
  photoUpdatedAt: string | null;
  raters: number;
  ready: boolean;
  selfDone: boolean;
  overall: number | null;
  meeting: ReviewMeeting | null;
}

export interface Review360Reports {
  id: string;
  title: string;
  closedAt: string | null;
  minRaters: number;
  people: Review360ReportRow[];
}

export type Review360ReportQuestion =
  | {
      id: string;
      kind: 'RATING';
      prompt: string;
      hint: string | null;
      answered: number;
      average: number | null;
      counts: number[];
      self: number | null;
    }
  | {
      id: string;
      kind: 'TEXT';
      prompt: string;
      hint: string | null;
      answered: number;
      texts: string[];
      selfText: string | null;
    };

export interface Review360Report {
  review: { id: string; title: string; closedAt: string | null };
  person: { id: string; name: string; photoUpdatedAt: string | null };
  raters: number;
  minRaters: number;
  selfDone: boolean;
  meeting: ReviewMeeting | null;
  available: boolean;
  reason?: string;
  questions?: Review360ReportQuestion[];
}

/// A correction somebody asked for, waiting for a manager.
export interface CorrectionRequest {
  id: string;
  timeEntryId: string;
  clockInAt: string;
  clockOutAt: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  createdAt: string;
  employee: { id: string; firstName: string; preferredName: string | null; lastName: string };
  timeEntry: {
    clockInAt: string;
    clockOutAt: string | null;
    autoClockedOutAt: string | null;
    location: { name: string };
  };
}

/// A waiting time-off request, clean or with why not.
export interface CleanTimeOffCheck {
  id: string;
  clean: boolean;
  why: string | null;
}

/// The diagnostics board (October 2026): which insurance covers which test.
export type DiagnosticSection = 'ULTRASOUND' | 'TESTING';
export type DiagnosticAnswer = 'YES' | 'NO' | 'PA' | 'CALL_REF' | 'NA';

export interface DiagnosticTest {
  id: string;
  section: DiagnosticSection;
  name: string;
  detail: string | null;
  duration: string | null;
  prep: string | null;
  selfPay: string | null;
}

export interface DiagnosticPlan {
  id: string;
  name: string;
  ecwName: string | null;
  payerId: string | null;
  insuranceId: string | null;
  note: string | null;
}

export interface DiagnosticCell {
  testId: string;
  planId: string;
  answer: DiagnosticAnswer;
  note: string | null;
}

export interface DiagnosticsBoard {
  tests: DiagnosticTest[];
  plans: DiagnosticPlan[];
  answers: DiagnosticCell[];
  reminders: { id: string; section: DiagnosticSection; text: string }[];
  updatedAt: string | null;
}

export type DiagnosticTestInput = Omit<DiagnosticTest, 'id'>;
export type DiagnosticPlanInput = Omit<DiagnosticPlan, 'id'>;

/// The reimbursements board (October 2026), managers and admins: what each
/// insurance pays per code. An amount ("78.32") or the sheet's own words.
export interface ReimbursementCode {
  id: string;
  code: string;
  description: string | null;
}

export interface ReimbursementPayer {
  id: string;
  name: string;
  note: string | null;
}

export interface ReimbursementRate {
  codeId: string;
  payerId: string;
  amount: string | null;
  text: string | null;
}

export interface ReimbursementsBoard {
  codes: ReimbursementCode[];
  payers: ReimbursementPayer[];
  rates: ReimbursementRate[];
  updatedAt: string | null;
}

/// The referral phone book (October 2026), kept by all staff.
export interface ReferralOffice {
  id: string;
  label: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
}

export interface ReferralContact {
  id: string;
  category: string;
  name: string;
  /// The practice, for the whole entry (October 2026).
  practice?: string | null;
  /// Starred: one of the practice's preferred places.
  preferred: boolean;
  email: string | null;
  website: string | null;
  notes: string | null;
  offices: ReferralOffice[];
  updatedAt: string;
}

export interface ReferralOfficeInput {
  label?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
}

export interface ReferralContactInput {
  category: string;
  name: string;
  practice?: string | null;
  preferred?: boolean;
  email?: string | null;
  website?: string | null;
  notes?: string | null;
  offices?: ReferralOfficeInput[];
}

/// Vendor payments (October 2026), admins only.
export type VendorPaymentMethod = 'CHECK' | 'CASH' | 'QUICKBOOKS' | 'OTHER';
export type VendorPaymentStatus = 'TO_PAY' | 'SENT' | 'COMPLETED';

export interface VendorPayment {
  id: string;
  vendorId: string;
  forWhat: string;
  invoiceNumber: string | null;
  method: VendorPaymentMethod;
  checkNumber: string | null;
  amount: number | null;
  status: VendorPaymentStatus;
  sentOn: string | null;
  completedOn: string | null;
  note: string | null;
  createdAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  address: string | null;
  details: string | null;
  active: boolean;
  payments: VendorPayment[];
  outstanding: number;
}

export interface VendorInput {
  name: string;
  address?: string;
  details?: string;
  active?: boolean;
}

export interface VendorPaymentInput {
  forWhat: string;
  invoiceNumber?: string;
  method: VendorPaymentMethod;
  checkNumber?: string;
  amount?: number | null;
  status: VendorPaymentStatus;
  sentOn?: string | null;
  completedOn?: string | null;
  note?: string;
}

// ------------------------------------------------------------------ guides

export type GuideSlug = 'front-desk' | 'results-playbook' | 'inpatient-notes';

export interface GuideSection {
  id: string;
  group: string;
  title: string;
  /// In the guides' markup (`lib/guide-markup.ts`).
  body: string;
  updatedAt: string;
}

export interface Guide {
  sections: GuideSection[];
  updatedAt: string | null;
  canEdit: boolean;
}

export interface GuideSectionInput {
  group: string;
  title: string;
  body: string;
}

// ---------------------------------------------------------------- invoices

export type InvoiceBillTo = 'VENDOR' | 'PATIENT';
export type InvoiceStatus = 'DUE' | 'PAID';

export interface InvoiceLine {
  id?: string;
  description: string;
  amountCents: number;
}

export interface Invoice {
  id: string;
  number: number;
  issuedOn: string;
  dueOn: string | null;
  billTo: InvoiceBillTo;
  /// Empty for a patient: their details are on the PDF only.
  billToName: string | null;
  billToAddress: string | null;
  status: InvoiceStatus;
  paidOn: string | null;
  note: string | null;
  /// Who it is paid to, as it went out; all null is the practice.
  payToName: string | null;
  payToLines: string | null;
  payableTo: string | null;
  lines: InvoiceLine[];
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceInput {
  issuedOn: string;
  dueOn: string | null;
  billTo: InvoiceBillTo;
  billToName?: string;
  billToAddress?: string;
  status: InvoiceStatus;
  paidOn: string | null;
  note?: string;
  /// Null for the practice.
  payTo: PayeeInput | null;
  lines: { description: string; amountCents: number }[];
}

/// A saved vendor or business to bill. Never a patient.
export interface InvoiceVendor {
  id: string;
  name: string;
  /// Address and email, one per line.
  address: string | null;
}

/// A saved "Pay to" for invoices, such as a provider paid directly.
export interface InvoicePayee {
  id: string;
  name: string;
  /// Address, email and phone, one per line.
  lines: string | null;
  payableTo: string;
}

export interface PayeeInput {
  name: string;
  lines: string;
  payableTo: string;
}

// ------------------------------------------------------------ tool access

/// Who may use one built-in form or guide: everyone, or these job roles.
export interface ToolSetting {
  key: string;
  everyone: boolean;
  jobRoleIds: string[];
}

// ---------------------------------------------------------- office admins

export type OfficeAdminConcern = 'OFF' | 'HALF_DAY_OFF' | 'NOT_ON_ROTA' | 'NOBODY';

/// One office's admin on one day.
export interface OfficeAdminOnDay {
  locationId: string;
  person: OnCallPerson | null;
  source: 'USUAL' | 'CHANGED' | 'NONE';
  note: string | null;
  /// Whether the usual pattern wants somebody that weekday.
  usualDay: boolean;
  /// Managers only: worth a look.
  concerns?: OfficeAdminConcern[];
}

export interface OfficeAdminDays {
  offices: { id: string; name: string }[];
  days: { date: string; admins: OfficeAdminOnDay[] }[];
}

export interface OfficeAdminPattern {
  offices: { id: string; name: string }[];
  /// 1 = Monday ... 7 = Sunday.
  entries: { locationId: string; weekday: number; employeeId: string }[];
  people: OnCallPerson[];
}

// -------------------------------------------------------------------- CME

export type CmeStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
export type CmeFormat = 'IN_PERSON' | 'ONLINE';

export interface CmeRequest {
  id: string;
  employeeId: string;
  title: string;
  organizer: string | null;
  format: CmeFormat;
  place: string | null;
  startsOn: string;
  endsOn: string;
  credits: number | null;
  registrationCents: number;
  travelCents: number;
  lodgingCents: number;
  otherCents: number;
  askedCents: number;
  reason: string | null;
  status: CmeStatus;
  approvedCents: number | null;
  decidedAt: string | null;
  decisionNote: string | null;
  reimbursedOn: string | null;
  reimbursedCents: number | null;
  createdAt: string;
  provider: OnCallPerson;
  decidedBy: OnCallPerson | null;
}

export interface CmeYear {
  year: number;
  allowanceCents: number | null;
  usedCents: number;
  waitingCents: number;
  leftCents: number | null;
}

export interface CmeMine {
  isProvider: boolean;
  allowanceCents: number | null;
  years: CmeYear[];
  requests: CmeRequest[];
}

export interface CmeOverview {
  year: number;
  requests: CmeRequest[];
  providers: (OnCallPerson & {
    allowanceCents: number | null;
    thisYear: CmeYear;
    nextYear: CmeYear;
  })[];
}

export interface CmeRequestInput {
  title: string;
  organizer?: string;
  format: CmeFormat;
  place?: string;
  startsOn: string;
  endsOn: string;
  credits?: number | null;
  registrationCents: number;
  travelCents: number;
  lodgingCents: number;
  otherCents: number;
  reason?: string;
}

/// Pay behind the PIN (October 2026): whether this session may see pay now.
export interface PayLockStatus {
  unlocked: boolean;
  /// When it locks again, unless something is done before then.
  until: string | null;
  hasPin: boolean;
  /// How long it stays open without use.
  minutes: number;
}

/// Pay and raises (October 2026): for the rota-cost people, behind the PIN.
export type PayRaiseStatus =
  'REQUESTED' | 'MEETING_SET' | 'OFFERED' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';

export type LeavingKind =
  'RESIGNED' | 'LET_GO' | 'LAID_OFF' | 'RETIRED' | 'END_OF_CONTRACT' | 'OTHER';

export interface PayPersonBasics {
  id: string;
  name: string;
  payType: 'HOURLY' | 'SALARY';
  hireDate: string | null;
  terminationDate: string | null;
  jobRoles: string[];
}

export interface PayUpcoming {
  rate: number;
  unit: PayRateUnit;
  effectiveOn: string;
  position: string | null;
}

export interface LeavingDetails {
  kind: LeavingKind | null;
  reason: string | null;
  lastPaycheckOn: string | null;
}

export interface ExitChecklistProgress {
  id: string;
  done: number;
  total: number;
  completed: boolean;
}

export interface PayOverview {
  current: (PayPersonBasics &
    StaffRecord['current'] & {
      upcoming: PayUpcoming | null;
      openRaise: {
        id: string;
        status: PayRaiseStatus;
        requestedOn: string;
        meetingAt: string | null;
      } | null;
    })[];
  former: (PayPersonBasics & {
    lastPosition: StaffRecord['current']['position'];
    lastPay: StaffRecord['current']['pay'];
    leaving: LeavingDetails;
    exitChecklist: ExitChecklistProgress | null;
  })[];
}

export interface PayRaise {
  id: string;
  status: PayRaiseStatus;
  requestedOn: string;
  askedRate: number | null;
  askedUnit: PayRateUnit | null;
  meeting: { eventId: string; startsAt: string } | null;
  decidedOn: string | null;
  newRate: number | null;
  newUnit: PayRateUnit | null;
  newPosition: string | null;
  effectiveOn: string | null;
  payChangeKept: boolean;
  note: string | null;
  recordedBy: string | null;
  updatedAt: string;
}

export interface PayPerson extends PayPersonBasics {
  changes: EmploymentChange[];
  current: StaffRecord['current'];
  upcoming: PayUpcoming | null;
  raises: PayRaise[];
  leaving: LeavingDetails & { updatedBy: string | null; updatedAt: string | null };
  exitChecklist: ExitChecklistProgress | null;
}

export interface RaiseRequestInput {
  requestedOn: string;
  askedRate: number | null;
  askedUnit: PayRateUnit | null;
  note: string | null;
}

export interface RaiseMeetingInput {
  startsAt: string;
  endsAt: string;
  place: string | null;
  createMeetLink: boolean;
}

export interface RaiseDecisionInput {
  outcome: 'OFFERED' | 'APPROVED' | 'DECLINED';
  newRate: number | null;
  newUnit: PayRateUnit | null;
  newPosition: string | null;
  effectiveOn: string | null;
  note: string | null;
}
