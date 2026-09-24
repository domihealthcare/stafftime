import type {
  Profile,
  Announcement,
  Attention,
  Checklist,
  Credential,
  CredentialKind,
  PayrollExportRecord,
  PayrollTarget,
  ChecklistKind,
  ChecklistTaskStatus,
  ChecklistTemplate,
  ConflictingShift,
  Coverage,
  Dashboard,
  DemoSummary,
  DirectoryEntry,
  PlanResult,
  PracticeSettings,
  Employee,
  JobRole,
  Location,
  PayPeriodInfo,
  FeedbackMessage,
  Survey,
  SurveyAudience,
  SurveyInputQuestion,
  SurveyResults,
  MyAvailability,
  PtoBalance,
  PtoPolicy,
  PtoRequest,
  ReportPreset,
  Resource,
  ResourceKind,
  ResourceSection,
  Shift,
  TeamAvailability,
  UnavailabilityKind,
  TemplateTaskInput,
  TimeEntry,
  UpdateLocationInput,
  OvertimeCheck,
  OwnOvertimeWeek,
  ApplicableSection,
  ClosingItemKind,
  ClosingRecord,
  ClosingSubmission,
  ClosingTemplateItem,
  ClosingTemplateRole,
  ClosingTemplateSection,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(body, response.status), extractCode(body));
  }

  return body as T;
}

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

/// Set when the server says a temporary password must be replaced before
/// anything else will work.
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export function isPasswordChangeRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === PASSWORD_CHANGE_REQUIRED;
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

export interface KioskEmployee {
  id: string;
  firstName: string;
  lastName: string;
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
    | 'ANNOUNCEMENT';
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
}

export interface CalendarLink {
  hasLink: boolean;
  token: string | null;
  createdAt: string | null;
}

export const api = {
  appConfig: () => request<AppConfig>('/config'),

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
  }) => request<PtoRequest>('/pto', { method: 'POST', body: JSON.stringify(body) }),
  reviewPto: (id: string, decision: 'APPROVED' | 'DENIED', reviewNote?: string) =>
    request<PtoRequest>(`/pto/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reviewNote }),
    }),
  cancelPto: (id: string) => request<PtoRequest>(`/pto/${id}/cancel`, { method: 'PATCH' }),
  ptoConflicts: (id: string) => request<ConflictingShift[]>(`/pto/${id}/conflicts`),
  ptoPolicy: () => request<PtoPolicy>('/pto/policy'),
  updatePtoPolicy: (body: Partial<Omit<PtoPolicy, 'id'>>) =>
    request<PtoPolicy>('/pto/policy', { method: 'PATCH', body: JSON.stringify(body) }),
  ptoBalance: (employeeId?: string) =>
    request<PtoBalance>(`/pto/balance${employeeId ? `?employeeId=${employeeId}` : ''}`),

  createEmployee: (body: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    payType: string;
    hireDate: string;
    locationIds?: string[];
    primaryLocationId?: string;
  }) => request<Employee>('/employees', { method: 'POST', body: JSON.stringify(body) }),
  updateEmployee: (
    id: string,
    body: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      payType: string;
      locationIds: string[];
      primaryLocationId: string;
      adpFileNumber: string | null;
    }>,
  ) => request<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  terminateEmployee: (id: string) => request<Employee>(`/employees/${id}`, { method: 'DELETE' }),

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

  practiceSettings: () => request<PracticeSettings>('/settings'),
  payPeriod: () => request<PayPeriodInfo>('/settings/pay-period'),
  updatePracticeSettings: (body: Partial<Omit<PracticeSettings, 'updatedAt'>>) =>
    request<PracticeSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setDigestPreference: (wantsDailyDigest: boolean) =>
    request<Employee>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ wantsDailyDigest }),
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
  approveTimeEntry: (id: string) =>
    request<TimeEntry>(`/time-entries/${id}/approve`, { method: 'PATCH' }),
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
    from: string;
    until: string;
    status?: string;
    notes?: string;
  }) => request<PlanResult>('/shifts/repeat', { method: 'POST', body: JSON.stringify(body) }),
  copyWeek: (body: {
    fromWeekStart: string;
    toWeekStart: string;
    locationId?: string;
    status?: string;
  }) => request<PlanResult>('/shifts/copy-week', { method: 'POST', body: JSON.stringify(body) }),
  coverage: (params: { from: string; to: string; locationId?: string }) =>
    request<Coverage>(`/shifts/coverage${toQuery(params)}`),
  /// Where somebody's week would land with this shift in it — asked before saving.
  overtimeCheck: (params: {
    employeeId: string;
    locationId: string;
    startsAt: string;
    endsAt: string;
    shiftId?: string;
  }) => request<OvertimeCheck>(`/shifts/overtime-check${toQuery(params)}`),
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
  }) => request<Shift>('/shifts', { method: 'POST', body: JSON.stringify(body) }),
  /// Put somebody on a shift, take them off it (`employeeId: null` leaves it
  /// open), or change its times or job role.
  updateShift: (
    id: string,
    body: {
      employeeId?: string | null;
      jobRoleId?: string | null;
      isRemote?: boolean;
      startsAt?: string;
      endsAt?: string;
      status?: string;
    },
  ) => request<Shift>(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
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
    kind: CredentialKind;
    name: string;
    issuer?: string;
    issuedOn?: string;
    expiresOn: string;
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

  announcements: () => request<Announcement[]>('/announcements'),
  primaryAnnouncement: () =>
    request<{ announcement: Announcement | null }>('/announcements/primary'),
  createAnnouncement: (body: { title: string; body: string; isPrimary?: boolean }) =>
    request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(body) }),
  updateAnnouncement: (
    id: string,
    body: Partial<{ title: string; body: string; isPrimary: boolean }>,
  ) =>
    request<Announcement>(`/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAnnouncement: (id: string) =>
    request<{ deleted: boolean }>(`/announcements/${id}`, { method: 'DELETE' }),

  dashboard: (weeks: number) => request<Dashboard>(`/dashboard?weeks=${weeks}`),
  directory: () => request<DirectoryEntry[]>('/directory'),
  profile: () => request<Profile>('/profile'),
  updateProfile: (body: {
    preferredName?: string;
    pronouns?: string;
    phone?: string;
    about?: string;
  }) => request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  setPhoto: (image: string) =>
    request<Profile>('/profile/photo', { method: 'PUT', body: JSON.stringify({ image }) }),
  removePhoto: () => request<Profile>('/profile/photo', { method: 'DELETE' }),
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

  sendFeedback: (message: string) =>
    request<{ received: boolean }>('/feedback', {
      method: 'POST',
      body: JSON.stringify({ message }),
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
  }) => request<JobRole>('/job-roles', { method: 'POST', body: JSON.stringify(body) }),
  updateJobRole: (
    id: string,
    body: Partial<{
      name: string;
      description: string;
      colour: string;
      seesOwnPersonnelTabs: boolean;
    }>,
  ) => request<JobRole>(`/job-roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteJobRole: (id: string) =>
    request<{ deleted: boolean }>(`/job-roles/${id}`, { method: 'DELETE' }),
  addJobRoleMember: (id: string, employeeId: string) =>
    request<JobRole>(`/job-roles/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    }),
  removeJobRoleMember: (id: string, employeeId: string) =>
    request<JobRole>(`/job-roles/${id}/members/${employeeId}`, { method: 'DELETE' }),

  resources: () => request<{ sections: ResourceSection[] }>('/resources'),
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
