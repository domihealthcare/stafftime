import { t } from './i18n';
import type { ImportedPerson } from './staff-import';
import type {
  OnCallRota,
  OnCallSchedule,
  OnCallSwap,
  RotaCost,
  MyRequirement,
  RequirementInput,
  RequirementProgress,
  RequirementSummary,
  UsualShift,
  NotSignedIn,
  ReadBooking,
  CoverRequestStatus,
  CoverView,
  StaffingMinimum,
  BirthdayEntry,
  Profile,
  Announcement,
  PollInput,
  Attention,
  ExportCheck,
  Checklist,
  Credential,
  CredentialKind,
  CredentialStanding,
  CredentialType,
  PayrollExportRecord,
  PersonName,
  ProductivityPlan,
  ProductivityStatement,
  PayrollTarget,
  ChecklistKind,
  ChecklistTaskStatus,
  ChecklistTemplate,
  ConflictingShift,
  Coverage,
  Dashboard,
  DigestPreferences,
  DigestReader,
  DigestTopic,
  PracticeOverview,
  DemoSummary,
  TestDataCounts,
  TestDataPreview,
  DirectoryEntry,
  PlanResult,
  PracticeEvent,
  Rep,
  RepInput,
  PracticeSettings,
  Employee,
  EventInput,
  JobRole,
  Location,
  PayPeriodInfo,
  FeedbackKind,
  OfficeExtension,
  OfficeExtensionInput,
  FeedbackMessage,
  Survey,
  SurveyAudience,
  SurveyInputQuestion,
  SurveyResults,
  MyAvailability,
  PtoAdjustment,
  PtoBalance,
  PtoPolicy,
  PtoRequest,
  ReportPreset,
  DriveFolderListing,
  Resource,
  ResourceKind,
  ResourceSection,
  PublishCheck,
  Shift,
  StandingShift,
  WeeklyScheduleResult,
  TeamAvailability,
  UnavailabilityKind,
  TemplateTaskInput,
  TimeEntry,
  HandEntryReason,
  UpdateLocationInput,
  CoverOptions,
  CoverProposal,
  TimeOffClash,
  OvertimeCheck,
  OwnOvertimeWeek,
  ApplicableSection,
  ClosingItemKind,
  ClosingRecord,
  ClosingSubmission,
  ClosingTemplateItem,
  ClosingTemplateRole,
  ClosingTemplateSection,
  StaffBalance,
  StaffRecord,
  EmploymentChangeInput,
  PersonalRecordFields,
  SupplyRequest,
} from './types';

/**
 * The session lives in an httpOnly cookie the browser sends automatically, so
 * there is nothing for this file to attach and nothing for a script on the page
 * to steal. `credentials: 'include'` is what makes fetch send it.
 */

/// An error carrying the API's own message, so the UI can show the real reason
/// a clock-in was refused rather than a generic failure.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /// A machine-readable hint, where the server sends one.
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/// Long enough for a slow phone signal and a cold server; short enough that a
/// punch on a dead connection says so instead of spinning for minutes.
const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      signal: abort.signal,
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      abort.signal.aborted
        ? t(
            'The server took too long to answer. Check whether it went through before trying again.',
          )
        : t('Could not reach the server. Check your connection and try again.'),
    );
  } finally {
    window.clearTimeout(timer);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // A 401 anywhere but signing in or checking a password means the session
    // has ended — eight hours idle on a phone, typically. Say so to the app,
    // which goes back to the sign-in screen instead of leaving an error on a
    // screen that can do nothing about it.
    if (response.status === 401 && !NOT_A_SESSION_ANSWER.some((p) => path.startsWith(p))) {
      window.dispatchEvent(new Event(SESSION_ENDED));
    }
    throw new ApiError(response.status, extractMessage(body, response.status), extractCode(body));
  }

  return body as T;
}

/// Fired when the server says the session is over.
export const SESSION_ENDED = 'domi-staff:session-ended';
/// Where a 401 is an answer about a password, not about the session.
const NOT_A_SESSION_ANSWER = ['/auth/login', '/auth/change-password', '/auth/me', '/kiosk'];

/**
 * Fetches a file and hands back a blob. There is no URL a browser could open
 * directly — the payroll export files go through an authorised route — so a
 * download has to be fetched and then handed to the browser.
 */
async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, extractMessage(body, response.status), extractCode(body));
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
  };
}

function filenameFromDisposition(header: string | null): string {
  if (!header) return 'document';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Fall through to the plain form.
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? 'document';
}

/**
 * Pulls the machine-readable hint out of an error body.
 *
 * Nest spreads an exception's object payload across the top level, so a guard
 * throwing `{ message, code }` arrives as `{ message, code }` — not nested.
 * The nested shape is checked too, for handlers that wrap their payload.
 */
function extractCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  if ('code' in body) {
    const code = (body as { code: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }

  if ('message' in body) {
    const message = (body as { message: unknown }).message;
    if (message && typeof message === 'object' && 'code' in message) {
      const code = (message as { code: unknown }).code;
      if (typeof code === 'string') {
        return code;
      }
    }
  }

  return undefined;
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    // Validation failures come back as an array of messages.
    if (Array.isArray(message)) {
      return message.join('. ');
    }
    if (typeof message === 'string') {
      return message;
    }
    // A guard may send { message, code } instead of a bare string.
    if (message && typeof message === 'object' && 'message' in message) {
      const nested = (message as { message: unknown }).message;
      if (typeof nested === 'string') {
        return nested;
      }
    }
  }
  return `Request failed (${status}).`;
}

export interface ClockInPayload {
  locationId: string;
  method: 'WEB' | 'MOBILE' | 'KIOSK';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  employeeId?: string;
  /// Working from home — any day, flagged when there is no work-from-home shift.
  workFromHome?: boolean;
  /// Why somewhere other than the shift, if they said.
  otherPlaceReason?: string;
}

export interface ClockOutPayload {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  closing?: ClosingSubmission;
}

export interface AuthSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface KioskSession {
  deviceName: string;
  locationId: string;
  locationName: string;
}

/// A News post ticked to show publicly — on the time clock and the sign-in
/// page: the words only, no author, likes, comments or poll.
export interface PublicPost {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}
export type KioskPost = PublicPost;

export interface KioskEmployee {
  id: string;
  firstName: string;
  lastName: string;
  /// False until they choose a PIN on their profile; the tablet then shows how
  /// instead of the keypad.
  hasPin: boolean;
}

export interface KioskPunchResult {
  /// CHECKLIST: nothing punched yet — fill in the closing checklist, then send
  /// the PIN again with it.
  action: 'CLOCKED_IN' | 'CLOCKED_OUT' | 'CHECKLIST';
  checklist?: ApplicableSection[];
  employeeName: string;
  at: string;
  locationName: string;
  workedMinutes?: number;
  isLate: boolean;
}

export interface KioskDevice {
  id: string;
  name: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  pairingExpiresAt: string | null;
  createdAt: string;
  location: { id: string; name: string };
}

export interface NewKioskDevice {
  id: string;
  name: string;
  pairingCode: string;
  pairingExpiresAt: string;
  locationName: string;
}

/// The tablet's own calls. Authenticated by the device cookie, never a person.
export const kioskApi = {
  pair: (pairingCode: string) =>
    request<KioskSession>('/kiosk/pair', {
      method: 'POST',
      body: JSON.stringify({ pairingCode }),
    }),
  session: () => request<KioskSession>('/kiosk/session'),
  /// News posts an admin ticked to show on the time clock, newest first.
  posts: () => request<KioskPost[]>('/kiosk/posts'),
  employees: () => request<KioskEmployee[]>('/kiosk/employees'),
  punch: (employeeId: string, pin: string, closing?: ClosingSubmission) =>
    request<KioskPunchResult>('/kiosk/punch', {
      method: 'POST',
      body: JSON.stringify({ employeeId, pin, closing }),
    }),
  unpair: () => request<{ unpaired: boolean }>('/kiosk/unpair', { method: 'POST' }),
};

export const KIOSK_NOT_PAIRED = 'KIOSK_NOT_PAIRED';

export function isKioskUnpaired(error: unknown): boolean {
  return error instanceof ApiError && error.code === KIOSK_NOT_PAIRED;
}

export interface TimesheetExportOptions {
  from: string;
  to: string;
  locationId?: string;
  employeeIds?: string[];
  statuses?: string[];
  includeOpen?: boolean;
  columns?: string[];
  includeSummary?: boolean;
  splitOvertime?: boolean;
  format?: 'xlsx' | 'csv';
  /// Which payroll target. Defaults to the spreadsheet.
  target?: string;
  /// ADP only: the Batch ID (8 characters at most) and whether salaried staff
  /// go in the file.
  batchId?: string;
  includeSalaried?: boolean;
}

/// What the ADP TotalSource import needs and what it has.
export interface AdpStatus {
  companyCode: string | null;
  columns: string[];
  headerRowCount: number;
  footerRowCount: number;
  regularColumn: string | null;
  overtimeColumn: string | null;
  missing: string[];
  staffWithoutFileNumber: string[];
  updatedAt: string | null;
  /// Only after a worksheet was pasted: how many employee rows were left out.
  employeeRowsDropped?: number;
}

export interface ExportColumn {
  key: string;
  label: string;
  group: string;
  default: boolean;
  hint?: string;
}

export interface ExportPreview {
  entryCount: number;
  employeeCount: number;
  totalHours: number;
  openEntryCount: number;
  flaggedCount: number;
  overtimeHours: number;
  /// How many of these hours have already gone to payroll once.
  alreadyExportedCount: number;
  /// …and how many of those have been corrected since. Those corrections have
  /// not reached payroll, so they have to go out in this run.
  correctedSinceExportCount: number;
}

export interface AppNotification {
  id: string;
  kind:
    | 'TIME_OFF_DECIDED'
    | 'TIME_OFF_REQUESTED'
    | 'OVERTIME'
    | 'SCHEDULE_CHANGED'
    | 'SURVEY_OPEN'
    | 'CHECKLIST_STARTED'
    | 'ANNOUNCEMENT'
    | 'NEWS_COMMENT'
    | 'EVENT'
    | 'PRODUCTIVITY'
    | 'PUNCH_REMINDER'
    | 'PROFILE_PHOTO'
    | 'LICENSE_REMINDER'
    | 'ONBOARDING_REMINDER'
    | 'AVAILABILITY_CLASH'
    | 'COVER_REQUEST'
    | 'REQUIRED'
    | 'ON_CALL';
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  unread: number;
}

export interface AppConfig {
  environment: 'production' | 'test';
  isTestEnvironment: boolean;
  /// The commit the server is running, when the host says (Vercel does).
  version: string | null;
  /// Whether events can have a Google Meet link made for them.
  googleMeet?: boolean;
  /// Whether shifts and events go out as calendar invites (and so have left
  /// the subscribed feed, which keeps closures and time off).
  calendarInvites?: boolean;
  /// Whether "Ask Domi Staff" is switched on.
  assistant?: boolean;
}

export interface CalendarInviteStatus {
  enabled: boolean;
  calendarMade: boolean;
  /// Invites to send, change or cancel.
  pending: number;
  /// Invites out for things still to come.
  upcoming: number;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface CalendarInviteRound {
  sent: number;
  cancelled: number;
  failed: number;
  remaining: number;
}

export interface CalendarLink {
  hasLink: boolean;
  token: string | null;
  createdAt: string | null;
}

/// Several parts of a screen want the config at once; one answer serves them
/// for a minute, which still lets the Help page notice a new release.
let configCache: { at: number; answer: Promise<AppConfig> } | null = null;

/// Fired after anything that changes how many time-off requests wait for a
/// decision, so the badge on the tab follows at once.
export const TIME_OFF_CHANGED = 'domi-staff:time-off-changed';
function timeOffChanged<T>(result: T): T {
  window.dispatchEvent(new Event(TIME_OFF_CHANGED));
  return result;
}

/// A post's Spanish as the editor sends it: an empty title clears it.
type SpanishWords = { titleEs?: string; bodyEs?: string; spanishByAi?: boolean };

export const api = {
  /// "Ask Domi Staff": a question, with the conversation on screen so far and
  /// the Help topics picked as likely to answer it.
  ask: (
    question: string,
    history: { role: 'user' | 'assistant'; text: string }[],
    help: { question: string; answer: string }[] = [],
  ) =>
    request<{ answer: string; left: number }>('/assistant/ask', {
      method: 'POST',
      body: JSON.stringify({ question, history, help }),
    }),
  appConfig: () => {
    if (!configCache || Date.now() - configCache.at > 60_000) {
      const answer = request<AppConfig>('/config');
      configCache = { at: Date.now(), answer };
      answer.catch(() => (configCache = null));
    }
    return configCache.answer;
  },

  // ---------------------------------------------------------- notifications
  /// The bell: your own notifications, newest first.
  notifications: () => request<NotificationList>('/notifications'),
  unreadNotifications: () => request<{ unread: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<{ unread: number }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ unread: number }>('/notifications/read-all', { method: 'POST' }),

  // ------------------------------------------------------------------- calendar
  calendarLink: () => request<CalendarLink>('/calendar/link'),
  issueCalendarLink: () => request<{ token: string }>('/calendar/link', { method: 'POST' }),
  revokeCalendarLink: () => request<{ revoked: boolean }>('/calendar/link', { method: 'DELETE' }),

  // ------------------------------------------------------------- first-run setup
  requestPasswordReset: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ email: string; signedOutEverywhere: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  setupStatus: () => request<{ needsSetup: boolean }>('/setup/status'),
  createFirstAdmin: (body: {
    setupToken: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) =>
    request<{ created: boolean; email: string }>('/setup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ---------------------------------------------------------------- saved reports
  listReportPresets: () => request<ReportPreset[]>('/exports/presets'),
  saveReportPreset: (body: {
    name: string;
    isShared?: boolean;
    options: Partial<TimesheetExportOptions>;
  }) => request<ReportPreset>('/exports/presets', { method: 'POST', body: JSON.stringify(body) }),
  updateReportPreset: (
    id: string,
    body: { name?: string; isShared?: boolean; options?: Partial<TimesheetExportOptions> },
  ) =>
    request<ReportPreset>(`/exports/presets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteReportPreset: (id: string) =>
    request<{ deleted: boolean }>(`/exports/presets/${id}`, { method: 'DELETE' }),
  reportPresetOptions: (id: string) =>
    request<Partial<TimesheetExportOptions>>(`/exports/presets/${id}/options`),

  // -------------------------------------------------------------------------- pto
  listPto: (params: Record<string, string | undefined> = {}) =>
    request<PtoRequest[]>(`/pto${toQuery(params)}`),
  ptoPendingCount: () => request<{ pending: number }>('/pto/pending-count'),
  createPto: (body: {
    type: string;
    startDate: string;
    endDate: string;
    isHalfDay?: boolean;
    notes?: string;
    employeeId?: string;
  }) =>
    request<PtoRequest>('/pto', { method: 'POST', body: JSON.stringify(body) }).then(
      timeOffChanged,
    ),
  /// "Help me word it" on declining time off (AI): a reason to edit.
  declineWording: (id: string, notes: string) =>
    request<{ reason: string | null }>(`/pto/${id}/decline-wording`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  reviewPto: (
    id: string,
    decision: 'APPROVED' | 'DENIED',
    reviewNote?: string,
    /// On approving: what happens to their shifts in those days.
    shifts?: 'KEEP' | 'REMOVE' | 'OPEN',
  ) =>
    request<PtoRequest>(`/pto/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reviewNote, shifts }),
    }).then(timeOffChanged),
  cancelPto: (id: string) =>
    request<PtoRequest>(`/pto/${id}/cancel`, { method: 'PATCH' }).then(timeOffChanged),
  ptoConflicts: (id: string) => request<ConflictingShift[]>(`/pto/${id}/conflicts`),
  /// Too many from the same job role and office off on those days, this one counted.
  ptoClashes: (id: string) => request<TimeOffClash[]>(`/pto/${id}/clashes`),
  /// Time off already taken, written down by an admin on a staff profile.
  recordPto: (body: {
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
    isHalfDay?: boolean;
    comment?: string;
  }) =>
    request<PtoRequest>('/pto/record', { method: 'POST', body: JSON.stringify(body) }).then(
      timeOffChanged,
    ),
  removeRecordedPto: (id: string) =>
    request<{ deleted: boolean }>(`/pto/${id}/recorded`, { method: 'DELETE' }).then(timeOffChanged),

  ptoPolicy: () => request<PtoPolicy>('/pto/policy'),
  updatePtoPolicy: (body: Partial<Omit<PtoPolicy, 'id'>>) =>
    request<PtoPolicy>('/pto/policy', { method: 'PATCH', body: JSON.stringify(body) }),
  ptoBalance: (employeeId?: string) =>
    request<PtoBalance>(`/pto/balance${employeeId ? `?employeeId=${employeeId}` : ''}`),
  staffPtoBalances: () => request<StaffBalance[]>('/pto/balances'),
  /// One person's row of the above, for Adjust on their staff profile.
  staffPtoBalance: (employeeId: string) => request<StaffBalance>(`/pto/balances/${employeeId}`),
  calendarInviteStatus: () => request<CalendarInviteStatus>('/calendar-invites/status'),
  sendCalendarInvites: () =>
    request<CalendarInviteRound>('/calendar-invites/sync', { method: 'POST' }),
  adjustPtoBalance: (employeeId: string, body: PtoAdjustment) =>
    request<StaffBalance>(`/pto/balances/${employeeId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  createEmployee: (body: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    payType: string;
    hireDate?: string;
    locationIds?: string[];
    primaryLocationId?: string;
  }) => request<Employee>('/employees', { method: 'POST', body: JSON.stringify(body) }),
  birthdays: (from: string, to: string) =>
    request<BirthdayEntry[]>(`/directory/birthdays?from=${from}&to=${to}`),
  sendWelcome: (id: string) =>
    request<{ welcomeSentAt: string }>(`/employees/${id}/welcome`, { method: 'POST' }),
  /// Everybody still here who has never signed in, and why (admins).
  notSignedIn: () => request<NotSignedIn[]>('/employees/welcome/pending'),
  sendWelcomeToEveryone: () =>
    request<{
      sent: number;
      failed: { name: string; email: string; reason: string }[];
      remaining: number;
    }>('/employees/welcome', { method: 'POST' }),
  importEmployees: (people: ImportedPerson[]) =>
    request<{ created: number; ids: string[] }>('/employees/import', {
      method: 'POST',
      body: JSON.stringify({ people }),
    }),
  updateEmployee: (
    id: string,
    body: Partial<{
      firstName: string;
      lastName: string;
      preferredName: string | null;
      postNominals: string | null;
      email: string;
      phone: string | null;
      role: string;
      payType: string;
      /// ACTIVE brings back somebody marked as having left.
      employmentStatus: 'ACTIVE';
      locationIds: string[];
      primaryLocationId: string;
      adpFileNumber: string | null;
      hireDate: string | null;
      birthdayMonth: number | null;
      birthdayDay: number | null;
    }>,
  ) => request<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /// `lastDay` is YYYY-MM-DD; left out, it is today.
  terminateEmployee: (id: string, lastDay?: string) =>
    request<Employee>(
      `/employees/${id}${lastDay ? `?terminationDate=${encodeURIComponent(lastDay)}` : ''}`,
      { method: 'DELETE' },
    ),

  createLocation: (body: {
    name: string;
    slug: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    geofenceRadiusFeet?: number;
  }) => request<Location>('/locations', { method: 'POST', body: JSON.stringify(body) }),
  updateLocation: (id: string, body: UpdateLocationInput) =>
    request<Location>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  exportColumns: () => request<{ columns: ExportColumn[]; defaults: string[] }>('/exports/columns'),
  payrollTargets: () => request<PayrollTarget[]>('/exports/targets'),
  exportHistory: () => request<PayrollExportRecord[]>('/exports/history'),
  adpStatus: () => request<AdpStatus>('/exports/adp'),
  updateAdp: (body: {
    companyCode?: string;
    worksheet?: string;
    regularColumn?: string | null;
    overtimeColumn?: string | null;
  }) => request<AdpStatus>('/exports/adp', { method: 'PATCH', body: JSON.stringify(body) }),
  /// The file exactly as it went out, not a fresh build of the same period.
  downloadPastExport: (id: string) => download(`/exports/history/${id}/file`),
  voidExport: (id: string) =>
    request<PayrollExportRecord>(`/exports/history/${id}/void`, { method: 'POST' }),
  previewExport: (options: TimesheetExportOptions) =>
    request<ExportPreview>('/exports/timesheet/preview', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  /// "Before you export": what is worth a look about this period first.
  checkExport: (options: TimesheetExportOptions & { target?: string; includeSalaried?: boolean }) =>
    request<ExportCheck>('/exports/timesheet/check', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  /// Returns the file itself, plus the filename the server chose.
  downloadExport: async (options: TimesheetExportOptions) => {
    const response = await fetch('/api/exports/timesheet', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(response.status, extractMessage(body, response.status));
    }

    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return {
      /// Which run this was recorded as, so the screen can show the history
      /// without asking again.
      exportId: response.headers.get('x-payroll-export-id'),
      blob: await response.blob(),
      filename: match?.[1] ?? `timesheet.${options.format ?? 'xlsx'}`,
    };
  },

  listKioskDevices: () => request<KioskDevice[]>('/kiosk/devices'),
  createKioskDevice: (name: string, locationId: string) =>
    request<NewKioskDevice>('/kiosk/devices', {
      method: 'POST',
      body: JSON.stringify({ name, locationId }),
    }),
  regenerateKioskCode: (deviceId: string) =>
    request<NewKioskDevice>(`/kiosk/devices/${deviceId}/pairing-code`, { method: 'POST' }),
  revokeKioskDevice: (deviceId: string) =>
    request<{ revoked: boolean }>(`/kiosk/devices/${deviceId}`, { method: 'DELETE' }),
  setKioskPin: (employeeId: string, pin: string) =>
    request<{ set: boolean }>(`/kiosk/employees/${employeeId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pin }),
    }),
  clearKioskPin: (employeeId: string) =>
    request<{ cleared: boolean }>(`/kiosk/employees/${employeeId}/pin`, { method: 'DELETE' }),

  login: (email: string, password: string) =>
    request<Employee>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ signedOut: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<Employee>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean; otherSessionsSignedOut: number }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  listSessions: () => request<AuthSession[]>('/auth/sessions'),
  attention: () => request<Attention>('/attention'),

  loadDemoData: () => request<DemoSummary>('/demo/load', { method: 'POST' }),
  testData: () => request<TestDataPreview>('/demo/test-data'),
  clearTestData: () =>
    request<TestDataCounts>('/demo/clear', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'clear-test-data' }),
    }),

  practiceSettings: () => request<PracticeSettings>('/settings'),
  payPeriod: () => request<PayPeriodInfo>('/settings/pay-period'),
  updatePracticeSettings: (body: Partial<Omit<PracticeSettings, 'updatedAt'>>) =>
    request<PracticeSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setDigestPreference: (preferences: DigestPreferences) =>
    request<Employee>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    }),
  digestSettings: () =>
    request<{ people: DigestReader[]; uncovered: DigestTopic[] }>('/digest-settings'),
  /// Admins only: somebody else's round-up.
  updateDigestSettings: (employeeId: string, preferences: DigestPreferences) =>
    request<DigestReader>(`/digest-settings/${employeeId}`, {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    }),
  revokeOtherSessions: () => request<{ signedOut: number }>('/auth/sessions', { method: 'DELETE' }),
  setTemporaryPassword: (employeeId: string, temporaryPassword: string) =>
    request<{ set: boolean }>(`/auth/employees/${employeeId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ temporaryPassword }),
    }),

  listLocations: (includeInactive = false) =>
    request<Location[]>(`/locations${includeInactive ? '?includeInactive=true' : ''}`),
  listEmployees: () => request<Employee[]>('/employees'),
  employee: (id: string) => request<Employee>(`/employees/${id}`),

  // ------------------------------------------------- staff profiles (admins only)
  staffRecord: (employeeId: string) => request<StaffRecord>(`/staff-records/${employeeId}`),
  updatePersonalRecord: (employeeId: string, body: Partial<PersonalRecordFields>) =>
    request<StaffRecord>(`/staff-records/${employeeId}/personal`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  addEmploymentChange: (employeeId: string, body: EmploymentChangeInput) =>
    request<StaffRecord>(`/staff-records/${employeeId}/changes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateEmploymentChange: (id: string, body: EmploymentChangeInput) =>
    request<StaffRecord>(`/staff-records/changes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  removeEmploymentChange: (id: string) =>
    request<StaffRecord>(`/staff-records/changes/${id}`, { method: 'DELETE' }),

  currentEntry: () => request<TimeEntry | null>('/time-entries/current'),
  clockIn: (payload: ClockInPayload) =>
    request<TimeEntry>('/time-entries/clock-in', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // ------------------------------------------------------------ closing checklists
  closingMine: () => request<{ sections: ApplicableSection[] }>('/closing/mine'),
  closingRecords: (date: string, locationId?: string) =>
    request<ClosingRecord[]>(`/closing/records${toQuery({ date, locationId })}`),
  supplies: () => request<SupplyRequest[]>('/closing/supplies'),
  markSupplyOrdered: (id: string) =>
    request<{ ordered: boolean }>(`/closing/supplies/${id}/ordered`, { method: 'POST' }),
  closingTemplates: () => request<ClosingTemplateRole[]>('/closing/templates'),
  createClosingSection: (body: { jobRoleId: string; title: string; isPosition?: boolean }) =>
    request<ClosingTemplateSection>('/closing/sections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateClosingSection: (id: string, body: { title?: string; isPosition?: boolean }) =>
    request<ClosingTemplateSection>(`/closing/sections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteClosingSection: (id: string) =>
    request<{ deleted: boolean }>(`/closing/sections/${id}`, { method: 'DELETE' }),
  moveClosingSection: (id: string, direction: 'up' | 'down') =>
    request<{ moved: boolean }>(`/closing/sections/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  createClosingItem: (body: {
    sectionId: string;
    kind: ClosingItemKind;
    text: string;
    target?: number | null;
    weekdays?: number[];
    locationId?: string | null;
  }) =>
    request<ClosingTemplateItem>('/closing/items', { method: 'POST', body: JSON.stringify(body) }),
  updateClosingItem: (
    id: string,
    body: {
      kind?: ClosingItemKind;
      text?: string;
      target?: number | null;
      weekdays?: number[];
      locationId?: string | null;
    },
  ) =>
    request<ClosingTemplateItem>(`/closing/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteClosingItem: (id: string) =>
    request<{ deleted: boolean }>(`/closing/items/${id}`, { method: 'DELETE' }),
  moveClosingItem: (id: string, direction: 'up' | 'down') =>
    request<{ moved: boolean }>(`/closing/items/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  clockOut: (payload: ClockOutPayload) =>
    request<TimeEntry>('/time-entries/clock-out', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listTimeEntries: (params: Record<string, string | undefined> = {}) =>
    request<TimeEntry[]>(`/time-entries${toQuery(params)}`),
  /// A day with no punch at all, entered by a manager.
  addHours: (body: {
    employeeId: string;
    locationId: string;
    clockInAt: string;
    clockOutAt: string;
    reason: HandEntryReason;
    note: string;
    /// Set only after the server has refused once because the day's pay
    /// period has already gone to payroll.
    acknowledgeExported?: boolean;
  }) => request<TimeEntry>('/time-entries', { method: 'POST', body: JSON.stringify(body) }),
  /// Somebody has found out why hours had to be entered by hand.
  checkHandEntry: (id: string, finding: string) =>
    request<TimeEntry>(`/time-entries/${id}/checked`, {
      method: 'PATCH',
      body: JSON.stringify({ finding: finding.trim() || undefined }),
    }),
  approveTimeEntry: (id: string) =>
    request<TimeEntry>(`/time-entries/${id}/approve`, { method: 'PATCH' }),
  /// Of these, approves the ones with nothing flagged; says how many of each.
  approveCleanTimeEntries: (ids: string[]) =>
    request<{ approved: number; left: number }>('/time-entries/approve-clean', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  editTimeEntry: (
    id: string,
    body: {
      clockInAt?: string;
      clockOutAt?: string;
      clearClockOut?: boolean;
      editReason: string;
      /// Set only after the server has refused once because these hours have
      /// already gone to payroll.
      acknowledgeExported?: boolean;
    },
  ) => request<TimeEntry>(`/time-entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  repeatShifts: (body: {
    /// Absent for open shifts.
    employeeId?: string;
    jobRoleId?: string;
    /// Open shifts only: how many each day.
    openCount?: number;
    isRemote?: boolean;
    locationId: string;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    /// Every week when absent; see `lib/repeat-pattern.ts`.
    everyWeeks?: number;
    weeksOfMonth?: number[];
    from: string;
    /// Absent: no end date — a standing shift.
    until?: string;
    status?: string;
    notes?: string;
  }) => request<PlanResult>('/shifts/repeat', { method: 'POST', body: JSON.stringify(body) }),
  /// Regular shifts with no end date that are still running.
  standingShifts: () => request<StandingShift[]>('/shifts/standing'),
  updateStandingShift: (
    id: string,
    body: {
      locationId: string;
      jobRoleId?: string | null;
      isRemote?: boolean;
      openCount?: number;
      startTime: string;
      endTime: string;
      daysOfWeek: number[];
      everyWeeks?: number;
      weeksOfMonth?: number[];
      from?: string;
    },
  ) =>
    request<PlanResult & { from: string }>(`/shifts/standing/${id}/update`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// Somebody's usual week — a day not listed is a day off — from `from` on.
  setWeeklySchedule: (
    employeeId: string,
    body: {
      from: string;
      status: 'DRAFT' | 'PUBLISHED';
      days: {
        dayOfWeek: number;
        locationId: string;
        isRemote: boolean;
        jobRoleId: string | null;
        startTime: string;
        endTime: string;
      }[];
    },
  ) =>
    request<WeeklyScheduleResult>(`/shifts/weekly/${employeeId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  stopStandingShift: (id: string, lastDate: string) =>
    request<{ lastDate: string; removed: number }>(`/shifts/standing/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({ lastDate }),
    }),
  copyWeek: (body: {
    fromWeekStart: string;
    toWeekStart: string;
    locationId?: string;
    status?: string;
  }) => request<PlanResult>('/shifts/copy-week', { method: 'POST', body: JSON.stringify(body) }),
  coverage: (params: { from: string; to: string; locationId?: string }) =>
    request<Coverage>(`/shifts/coverage${toQuery(params)}`),
  /// Where somebody's week would land with this shift in it — asked before saving.
  staffingMinimums: () => request<StaffingMinimum[]>('/staffing/minimums'),
  setStaffingMinimums: (minimums: StaffingMinimum[]) =>
    request<StaffingMinimum[]>('/staffing/minimums', {
      method: 'PUT',
      body: JSON.stringify({ minimums }),
    }),
  usualShift: (employeeId: string, date: string) =>
    request<{ usual: UsualShift | null }>(`/shifts/usual${toQuery({ employeeId, date })}`),
  overtimeCheck: (params: {
    employeeId: string;
    locationId: string;
    startsAt: string;
    endsAt: string;
    shiftId?: string;
  }) => request<OvertimeCheck>(`/shifts/overtime-check${toQuery(params)}`),
  /// Who could work a shift, best first, and why.
  coverOptions: (shiftId: string) => request<CoverOptions>(`/shifts/${shiftId}/cover-options`),
  /// A first draft for these open shifts: somebody free for each, or nobody.
  suggestCover: (ids: string[]) =>
    request<CoverProposal[]>('/shifts/suggest-cover', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  /// Your own coming weeks that are over, or close to, the overtime line.
  myOvertime: () => request<OwnOvertimeWeek[]>('/shifts/my-overtime'),

  listShifts: (params: Record<string, string | undefined> = {}) =>
    request<Shift[]>(`/shifts${toQuery(params)}`),
  createShift: (body: {
    /// Null for an open shift.
    employeeId: string | null;
    locationId: string;
    jobRoleId?: string | null;
    isRemote?: boolean;
    startsAt: string;
    endsAt: string;
    status?: string;
    notes?: string | null;
  }) => request<Shift>('/shifts', { method: 'POST', body: JSON.stringify(body) }),
  /// Put somebody on a shift, take them off it (`employeeId: null` leaves it
  /// open), or change its times, job role or note (`notes: null` clears it).
  updateShift: (
    id: string,
    body: {
      employeeId?: string | null;
      jobRoleId?: string | null;
      isRemote?: boolean;
      startsAt?: string;
      endsAt?: string;
      status?: string;
      notes?: string | null;
    },
  ) => request<Shift>(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /// New hours ("13:00", on the office's clock) and place for a shift — this
  /// one, the same weekday from here on, or every later shift of theirs at its
  /// hours.
  retimeShift: (
    id: string,
    body: {
      startTime: string;
      endTime: string;
      scope: 'ONE' | 'SAME_WEEKDAY' | 'LATER';
      /// A new place; absent leaves it where it is.
      locationId?: string;
      isRemote?: boolean;
    },
  ) => request<PlanResult>(`/shifts/${id}/retime`, { method: 'POST', body: JSON.stringify(body) }),
  /// Publishes several drafts at once; each person is told once.
  publishShifts: (ids: string[]) =>
    request<{ published: number; skipped: number }>('/shifts/publish', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  /// "Before you publish": what is worth a look about these drafts first.
  checkPublish: (ids: string[], withOpenShifts = true) =>
    request<PublishCheck>('/shifts/publish-check', {
      method: 'POST',
      body: JSON.stringify({ ids, withOpenShifts }),
    }),
  deleteShift: (id: string) => request<unknown>(`/shifts/${id}`, { method: 'DELETE' }),

  listChecklists: (params: Record<string, string | undefined> = {}) =>
    request<Checklist[]>(`/checklists${toQuery(params)}`),
  checklist: (id: string) => request<Checklist>(`/checklists/${id}`),
  startChecklist: (body: {
    employeeId: string;
    kind: ChecklistKind;
    templateId?: string;
    anchorDate?: string;
  }) => request<Checklist>('/checklists', { method: 'POST', body: JSON.stringify(body) }),
  deleteChecklist: (id: string) =>
    request<{ deleted: boolean }>(`/checklists/${id}`, { method: 'DELETE' }),
  updateChecklistTask: (taskId: string, status: ChecklistTaskStatus, note?: string) =>
    request<Checklist>(`/checklists/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  listCredentials: (params: Record<string, string | undefined> = {}) =>
    request<Credential[]>(`/credentials${toQuery(params)}`),
  createCredential: (body: {
    employeeId: string;
    /// One of the practice's license types; its name and kind are used when
    /// these are left out, and its renewal interval can work out the expiry.
    credentialTypeId?: string;
    kind?: CredentialKind;
    name?: string;
    issuer?: string;
    issuedOn?: string;
    expiresOn?: string;
    notes?: string;
  }) => request<Credential>('/credentials', { method: 'POST', body: JSON.stringify(body) }),
  updateCredential: (
    id: string,
    body: Partial<{
      kind: CredentialKind;
      name: string;
      issuer: string;
      issuedOn: string;
      expiresOn: string;
      notes: string;
    }>,
  ) => request<Credential>(`/credentials/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveCredential: (id: string) =>
    request<Credential>(`/credentials/${id}/archive`, { method: 'POST' }),
  deleteCredential: (id: string) =>
    request<{ deleted: boolean }>(`/credentials/${id}`, { method: 'DELETE' }),
  /// Each person against the licenses their job roles ask for.
  credentialStanding: (employeeId?: string) =>
    request<CredentialStanding[]>(`/credentials/standing${toQuery({ employeeId })}`),
  credentialTypes: () => request<CredentialType[]>('/credential-types'),
  saveCredentialType: (
    id: string | null,
    body: {
      name: string;
      kind: CredentialKind;
      renewalMonths: number | null;
      requirements: { jobRoleId: string; required: boolean }[];
    },
  ) =>
    request<CredentialType>(id ? `/credential-types/${id}` : '/credential-types', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    }),
  removeCredentialType: (id: string) =>
    request<CredentialType>(`/credential-types/${id}`, { method: 'DELETE' }),

  /// Provider productivity. A provider reads only their own published
  /// statements; the rest is for managers and admins.
  myProductivity: () => request<Omit<ProductivityStatement, 'employee'>[]>('/productivity/mine'),
  /// Who may work out provider productivity — chosen by an admin.
  /// Phone notifications: this person's devices.
  pushStatus: () =>
    request<{
      available: boolean;
      publicKey: string | null;
      devices: {
        id: string;
        device: string | null;
        createdAt: string;
        lastSentAt: string | null;
      }[];
    }>('/push'),
  pushSubscribe: (body: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    device?: string;
  }) => request<unknown>('/push/subscribe', { method: 'POST', body: JSON.stringify(body) }),
  pushUnsubscribe: (endpoint: string) =>
    request<unknown>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushTest: () => request<unknown>('/push/test', { method: 'POST' }),
  /// Admins: switch phone notifications on for the practice.
  pushSwitchOn: () => request<unknown>('/push/switch-on', { method: 'POST' }),
  /// The provider on-call schedule: providers, managers and admins.
  onCall: (from: string, to: string) => request<OnCallSchedule>(`/on-call${toQuery({ from, to })}`),
  onCallRotas: () => request<OnCallRota[]>('/on-call/rotas'),
  saveOnCallRota: (body: {
    startsOn: string;
    changesAt: string;
    entries: { weekday: number; weekOfMonth: number; employeeId: string }[];
  }) => request<OnCallRota[]>('/on-call/rotas', { method: 'PUT', body: JSON.stringify(body) }),
  removeOnCallRota: (startsOn: string) =>
    request<OnCallRota[]>(`/on-call/rotas/${startsOn}`, { method: 'DELETE' }),
  setOnCallDay: (date: string, body: { employeeId: string | null; note?: string }) =>
    request<{ date: string; employeeId: string | null }>(`/on-call/days/${date}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  onCallSwaps: () => request<OnCallSwap[]>('/on-call/swaps'),
  askOnCallSwap: (body: {
    giveDate: string;
    partnerId: string;
    takeDate?: string | null;
    note?: string;
  }) => request<{ id: string }>('/on-call/swaps', { method: 'POST', body: JSON.stringify(body) }),
  answerOnCallSwap: (id: string, answer: 'accept' | 'decline' | 'cancel') =>
    request<{ status: string }>(`/on-call/swaps/${id}/${answer}`, { method: 'POST' }),
  /// What the rota costs, from one day to another (inclusive) — chosen people only.
  rotaCost: (from: string, to: string) => request<RotaCost>(`/rota-cost${toQuery({ from, to })}`),
  rotaCostAccess: () => request<PersonName[]>('/rota-cost/access'),
  grantRotaCostAccess: (employeeId: string) =>
    request<PersonName[]>(`/rota-cost/access/${employeeId}`, { method: 'PUT' }),
  revokeRotaCostAccess: (employeeId: string) =>
    request<PersonName[]>(`/rota-cost/access/${employeeId}`, { method: 'DELETE' }),
  productivityAccess: () => request<PersonName[]>('/productivity/access'),
  grantProductivityAccess: (employeeId: string) =>
    request<PersonName[]>(`/productivity/access/${employeeId}`, { method: 'PUT' }),
  revokeProductivityAccess: (employeeId: string) =>
    request<PersonName[]>(`/productivity/access/${employeeId}`, { method: 'DELETE' }),
  productivityPeople: () => request<PersonName[]>('/productivity/people'),
  productivityPlans: () => request<ProductivityPlan[]>('/productivity/plans'),
  productivityPlan: (employeeId: string) =>
    request<ProductivityPlan | null>(`/productivity/plans/${employeeId}`),
  saveProductivityPlan: (
    employeeId: string,
    body: {
      intervalWeeks: number;
      intervalsPerStatement: number;
      expectedPerInterval: number | null;
      multiplier: number | null;
      categories: string[];
      carriesBalance: boolean;
    },
  ) =>
    request<ProductivityPlan>(`/productivity/plans/${employeeId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  removeProductivityPlan: (employeeId: string) =>
    request<{ removed: boolean }>(`/productivity/plans/${employeeId}`, { method: 'DELETE' }),
  productivityStatements: (employeeId: string) =>
    request<ProductivityStatement[]>(`/productivity/statements${toQuery({ employeeId })}`),
  newProductivityStatement: (employeeId: string, startDate?: string) =>
    request<ProductivityStatement>('/productivity/statements', {
      method: 'POST',
      body: JSON.stringify({ employeeId, startDate }),
    }),
  saveProductivityStatement: (
    id: string,
    body: {
      intervals: {
        startDate: string;
        endDate: string;
        expected: number | null;
        counts: { label: string; count: number }[];
      }[];
      multiplier: number | null;
      paidOn: string | null;
      note: string | null;
    },
  ) =>
    request<ProductivityStatement>(`/productivity/statements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  publishProductivityStatement: (id: string) =>
    request<ProductivityStatement>(`/productivity/statements/${id}/publish`, { method: 'POST' }),
  unpublishProductivityStatement: (id: string) =>
    request<ProductivityStatement>(`/productivity/statements/${id}/unpublish`, { method: 'POST' }),
  deleteProductivityStatement: (id: string) =>
    request<{ removed: boolean }>(`/productivity/statements/${id}`, { method: 'DELETE' }),

  /// Meetings and practice events overlapping [from, to), as ISO instants.
  events: (from: string, to: string) =>
    request<PracticeEvent[]>(
      `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  /// `created` is how many dates were written — more than one for a series.
  createEvent: (body: EventInput) =>
    request<PracticeEvent & { created: number }>('/events', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// `following` changes this date and every one after it in its series.
  updateEvent: (id: string, body: EventInput, scope: 'one' | 'following' = 'one') =>
    request<PracticeEvent & { created: number }>(`/events/${id}?scope=${scope}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  /// Required reading and tasks: what is asked of you, and confirming it.
  myRequirements: () => request<MyRequirement[]>('/requirements/mine'),
  confirmRequirement: (id: string) =>
    request<{ done: boolean }>(`/requirements/${id}/done`, { method: 'POST' }),
  /// Managers and admins: everything set, one's progress, and changes.
  requirements: () => request<RequirementSummary[]>('/requirements'),
  requirementProgress: (id: string) => request<RequirementProgress>(`/requirements/${id}`),
  createRequirement: (body: RequirementInput) =>
    request<RequirementSummary>('/requirements', { method: 'POST', body: JSON.stringify(body) }),
  updateRequirement: (id: string, body: RequirementInput) =>
    request<RequirementSummary>(`/requirements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  closeRequirement: (id: string, closed: boolean) =>
    request<{ closed: boolean }>(`/requirements/${id}/${closed ? 'close' : 'reopen'}`, {
      method: 'POST',
    }),
  remindRequirement: (id: string) =>
    request<{ reminded: number }>(`/requirements/${id}/remind`, { method: 'POST' }),
  deleteRequirement: (id: string) =>
    request<{ removed: boolean }>(`/requirements/${id}`, { method: 'DELETE' }),
  /// The reps who book lunches: managers and admins only.
  reps: () => request<Rep[]>('/reps'),
  createRep: (body: RepInput) =>
    request<Rep>('/reps', { method: 'POST', body: JSON.stringify(body) }),
  updateRep: (id: string, body: RepInput) =>
    request<Rep>(`/reps/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRep: (id: string) => request<{ removed: boolean }>(`/reps/${id}`, { method: 'DELETE' }),
  /// Pay days from one date to another (YYYY-MM-DD, inclusive): the Friday
  /// after each pay period ends. None until a pay period is set.
  payDays: (from: string, to: string) =>
    request<{ payDays: string[] }>(
      `/calendar/pay-days?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  /// Every closure and holiday in `fromYear`, put on the same date the year after.
  copyClosures: (fromYear: number) =>
    request<{
      copied: number;
      skipped: string[];
      /// Moving holidays put on their day next year: "Thanksgiving — Thu, Nov 26, 2026 → …".
      moved: string[];
      /// Fixed holidays landing on a weekend next year, to check.
      onWeekend: string[];
      toYear: number;
    }>('/events/closures/copy', {
      method: 'POST',
      body: JSON.stringify({ fromYear }),
    }),
  deleteEvent: (id: string, scope: 'one' | 'following' = 'one') =>
    request<{ deleted: number }>(`/events/${id}?scope=${scope}`, { method: 'DELETE' }),

  /// `latest`: only the newest few, plus the primary post wherever it falls.
  announcements: (latest?: number) =>
    request<Announcement[]>(latest ? `/announcements?latest=${latest}` : '/announcements'),
  /// The posts ticked to show publicly — needs no session, for the sign-in page.
  publicPosts: () => request<PublicPost[]>('/announcements/public'),
  primaryAnnouncement: () =>
    request<{ announcement: Announcement | null }>('/announcements/primary'),
  createAnnouncement: (
    body: {
      title: string;
      body: string;
      isPrimary?: boolean;
      showOnTimeClock?: boolean;
      poll?: PollInput;
    } & SpanishWords,
  ) => request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(body) }),
  /// `poll: null` takes the poll off; leaving it out leaves it as it is.
  updateAnnouncement: (
    id: string,
    body: Partial<{
      title: string;
      body: string;
      isPrimary: boolean;
      showOnTimeClock: boolean;
      poll: PollInput | null;
    }> &
      SpanishWords,
  ) =>
    request<Announcement>(`/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  /// "Ask who can cover" (October 2026).
  askCover: (shiftId: string, employeeIds: string[]) =>
    request<{ request: CoverRequestStatus | null }>(`/shifts/${shiftId}/ask-cover`, {
      method: 'POST',
      body: JSON.stringify({ employeeIds }),
    }),
  coverRequest: (shiftId: string) =>
    request<{ request: CoverRequestStatus | null }>(`/shifts/${shiftId}/cover-request`),
  stopCover: (shiftId: string) =>
    request<{ request: CoverRequestStatus | null }>(`/shifts/${shiftId}/cover-request/stop`, {
      method: 'POST',
    }),
  coverView: (id: string) => request<CoverView>(`/cover/${id}`),
  answerCover: (id: string, yes: boolean) =>
    request<CoverView>(`/cover/${id}/answer`, { method: 'POST', body: JSON.stringify({ yes }) }),
  /// A pasted booking read into the calendar's form (AI). Not saved.
  readBooking: (text: string) =>
    request<{ booking: ReadBooking | null }>('/events/read-booking', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  /// "Help me write it": an admin's notes as a post to edit (AI). Not saved.
  draftAnnouncement: (notes: string, title?: string) =>
    request<{ title: string; body: string }>('/announcements/draft', {
      method: 'POST',
      body: JSON.stringify({ notes, title }),
    }),
  /// The editor's words in Spanish (AI), to check before saving. Not saved.
  translateAnnouncement: (title: string, body: string) =>
    request<{ title: string; body: string }>('/announcements/translate', {
      method: 'POST',
      body: JSON.stringify({ title, body }),
    }),
  /// A post in Spanish for a reader who chose Español: kept, or translated
  /// now. `null` when there is none to give.
  announcementSpanish: (id: string) =>
    request<{
      spanish: { titleEs: string; bodyEs: string; spanishByAi: boolean } | null;
    }>(`/announcements/${id}/spanish`),
  deleteAnnouncement: (id: string) =>
    request<{ deleted: boolean }>(`/announcements/${id}`, { method: 'DELETE' }),
  likeAnnouncement: (id: string, liked: boolean) =>
    request<Announcement>(`/announcements/${id}/like`, { method: liked ? 'POST' : 'DELETE' }),
  commentOnAnnouncement: (id: string, body: string) =>
    request<Announcement>(`/announcements/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  editAnnouncementComment: (id: string, commentId: string, body: string) =>
    request<Announcement>(`/announcements/${id}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deleteAnnouncementComment: (id: string, commentId: string) =>
    request<Announcement>(`/announcements/${id}/comments/${commentId}`, { method: 'DELETE' }),
  /// Replaces your picks; an empty list takes your vote back.
  voteInPoll: (id: string, optionIds: string[]) =>
    request<Announcement>(`/announcements/${id}/vote`, {
      method: 'PUT',
      body: JSON.stringify({ optionIds }),
    }),
  setPollClosed: (id: string, closed: boolean) =>
    request<Announcement>(`/announcements/${id}/poll`, {
      method: 'PATCH',
      body: JSON.stringify({ closed }),
    }),

  dashboard: (weeks: number) => request<Dashboard>(`/dashboard?weeks=${weeks}`),
  /// Surveys, licenses, checklists, closing and what is waiting on a manager.
  practiceOverview: () => request<PracticeOverview>('/dashboard/practice'),
  directory: () => request<DirectoryEntry[]>('/directory'),
  extensions: () => request<OfficeExtension[]>('/directory/extensions'),
  saveExtensions: (lines: OfficeExtensionInput[]) =>
    request<OfficeExtension[]>('/directory/extensions', {
      method: 'PUT',
      body: JSON.stringify({ lines }),
    }),
  profile: () => request<Profile>('/profile'),
  updateProfile: (body: {
    preferredName?: string;
    pronouns?: string;
    phone?: string;
    about?: string;
    language?: 'en' | 'es';
  }) => request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  setPhoto: (image: string) =>
    request<Profile>('/profile/photo', { method: 'PUT', body: JSON.stringify({ image }) }),
  removePhoto: () => request<Profile>('/profile/photo', { method: 'DELETE' }),
  /// Admins: somebody else's photo, put up or taken down for them.
  setPhotoFor: (employeeId: string, image: string) =>
    request<Profile>(`/profile/photo/${employeeId}`, {
      method: 'PUT',
      body: JSON.stringify({ image }),
    }),
  removePhotoFor: (employeeId: string) =>
    request<Profile>(`/profile/photo/${employeeId}`, { method: 'DELETE' }),
  setOwnPin: (currentPassword: string, pin: string) =>
    request<Profile>('/profile/pin', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, pin }),
    }),

  surveys: () => request<Survey[]>('/surveys'),
  survey: (id: string) => request<Survey>(`/surveys/${id}`),
  surveyResults: (id: string) => request<SurveyResults>(`/surveys/${id}/results`),
  saveSurvey: (
    id: string | null,
    body: {
      title: string;
      intro?: string;
      audience: SurveyAudience;
      jobRoleId?: string;
      locationId?: string;
      questions: SurveyInputQuestion[];
    },
  ) =>
    request<Survey>(id ? `/surveys/${id}` : '/surveys', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    }),
  openSurvey: (id: string) => request<Survey>(`/surveys/${id}/open`, { method: 'POST' }),
  closeSurvey: (id: string) => request<Survey>(`/surveys/${id}/close`, { method: 'POST' }),
  deleteSurvey: (id: string) =>
    request<{ deleted: boolean }>(`/surveys/${id}`, { method: 'DELETE' }),
  answerSurvey: (
    id: string,
    answers: { questionId: string; rating?: number; choice?: string; text?: string }[],
  ) =>
    request<{ answered: boolean }>(`/surveys/${id}/responses`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  sendFeedback: (message: string, kind?: FeedbackKind) =>
    request<{ received: boolean }>('/feedback', {
      method: 'POST',
      body: JSON.stringify({ message, ...(kind ? { kind } : {}) }),
    }),
  feedback: (archived = false) =>
    request<FeedbackMessage[]>(`/feedback${archived ? '?archived=true' : ''}`),
  archiveFeedback: (id: string) =>
    request<FeedbackMessage>(`/feedback/${id}/archive`, { method: 'POST' }),

  availability: (employeeId?: string) =>
    request<MyAvailability>(`/availability${toQuery({ employeeId })}`),
  teamAvailability: () => request<TeamAvailability[]>('/availability/team'),
  addUnavailability: (body: {
    kind: UnavailabilityKind;
    weekday?: number;
    date?: string;
    startTime?: string;
    endTime?: string;
    note?: string;
  }) => request<unknown>('/availability', { method: 'POST', body: JSON.stringify(body) }),
  removeUnavailability: (id: string) =>
    request<{ removed: boolean; endsAfter: string | null }>(`/availability/${id}`, {
      method: 'DELETE',
    }),

  jobRoles: () => request<JobRole[]>('/job-roles'),
  createJobRole: (body: {
    name: string;
    description?: string;
    colour?: string;
    seesOwnPersonnelTabs?: boolean;
    usesClinicalForms?: boolean;
    usesWellnessForm?: boolean;
    seesRepCell?: boolean;
  }) => request<JobRole>('/job-roles', { method: 'POST', body: JSON.stringify(body) }),
  updateJobRole: (
    id: string,
    body: Partial<{
      name: string;
      description: string;
      colour: string;
      seesOwnPersonnelTabs: boolean;
      usesClinicalForms: boolean;
      usesWellnessForm: boolean;
      seesRepCell: boolean;
    }>,
  ) => request<JobRole>(`/job-roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteJobRole: (id: string) =>
    request<{ deleted: boolean }>(`/job-roles/${id}`, { method: 'DELETE' }),
  addJobRoleMember: (id: string, employeeId: string) =>
    request<JobRole>(`/job-roles/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    }),
  setMainJobRole: (id: string, employeeId: string) =>
    request<JobRole>(`/job-roles/${id}/members/${employeeId}/main`, { method: 'PUT' }),
  removeJobRoleMember: (id: string, employeeId: string) =>
    request<JobRole>(`/job-roles/${id}/members/${employeeId}`, { method: 'DELETE' }),

  /// driveShareWith: the address a manager shares a Drive folder with (null
  /// for staff, and until Google is set up).
  resources: () =>
    request<{ sections: ResourceSection[]; driveShareWith: string | null }>('/resources'),
  resource: (id: string) =>
    request<Resource & { jobRole: { id: string; name: string } | null }>(`/resources/${id}`),
  createResource: (body: {
    jobRoleId: string | null;
    kind: ResourceKind;
    title: string;
    url?: string;
    body?: string;
  }) => request<Resource>('/resources', { method: 'POST', body: JSON.stringify(body) }),
  updateResource: (
    id: string,
    body: Partial<{ jobRoleId: string | null; title: string; url: string; body: string }>,
  ) => request<Resource>(`/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resourceFiles: (id: string, folder?: string) =>
    request<DriveFolderListing>(`/resources/${id}/files${toQuery({ folder })}`),
  /// Opened in a new tab, which sends the session cookie like any request.
  /// The name on the end is only for the tab's title; the server ignores it.
  resourceFileUrl: (id: string, fileId: string, name: string) =>
    `/api/resources/${id}/files/${encodeURIComponent(fileId)}/${encodeURIComponent(name)}`,
  deleteResource: (id: string) =>
    request<{ deleted: boolean }>(`/resources/${id}`, { method: 'DELETE' }),

  checklistTemplates: (kind?: ChecklistKind) =>
    request<ChecklistTemplate[]>(`/checklists/templates${toQuery({ kind })}`),
  createChecklistTemplate: (body: {
    kind: ChecklistKind;
    name: string;
    description?: string;
    isDefault?: boolean;
    tasks: TemplateTaskInput[];
  }) =>
    request<ChecklistTemplate>('/checklists/templates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateChecklistTemplate: (
    id: string,
    body: { name?: string; description?: string; isDefault?: boolean; tasks?: TemplateTaskInput[] },
  ) =>
    request<ChecklistTemplate>(`/checklists/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  archiveChecklistTemplate: (id: string) =>
    request<ChecklistTemplate>(`/checklists/templates/${id}`, { method: 'DELETE' }),
};

function toQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : '';
}
