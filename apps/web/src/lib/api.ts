import type {
  ConflictingShift,
  Employee,
  Location,
  PtoRequest,
  ReportPreset,
  Shift,
  TimeEntry,
  UpdateLocationInput,
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
  action: 'CLOCKED_IN' | 'CLOCKED_OUT';
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
  punch: (employeeId: string, pin: string) =>
    request<KioskPunchResult>('/kiosk/punch', {
      method: 'POST',
      body: JSON.stringify({ employeeId, pin }),
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
}

export const api = {
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
  ) => request<ReportPreset>(`/exports/presets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
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
  cancelPto: (id: string) =>
    request<PtoRequest>(`/pto/${id}/cancel`, { method: 'PATCH' }),
  ptoConflicts: (id: string) => request<ConflictingShift[]>(`/pto/${id}/conflicts`),

  updateLocation: (id: string, body: UpdateLocationInput) =>
    request<Location>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  exportColumns: () =>
    request<{ columns: ExportColumn[]; defaults: string[] }>('/exports/columns'),
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
  revokeOtherSessions: () =>
    request<{ signedOut: number }>('/auth/sessions', { method: 'DELETE' }),
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
    },
  ) =>
    request<TimeEntry>(`/time-entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  listShifts: (params: Record<string, string | undefined> = {}) =>
    request<Shift[]>(`/shifts${toQuery(params)}`),
  createShift: (body: {
    employeeId: string;
    locationId: string;
    startsAt: string;
    endsAt: string;
    status?: string;
  }) => request<Shift>('/shifts', { method: 'POST', body: JSON.stringify(body) }),
  deleteShift: (id: string) => request<unknown>(`/shifts/${id}`, { method: 'DELETE' }),
};

function toQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : '';
}
