import type { Employee, Location, Shift, TimeEntry } from './types';

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

function extractCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (message && typeof message === 'object' && 'code' in message) {
      const code = (message as { code: unknown }).code;
      return typeof code === 'string' ? code : undefined;
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

export const api = {
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

  listLocations: () => request<Location[]>('/locations'),
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
  editTimeEntry: (id: string, body: { clockInAt?: string; clockOutAt?: string; editReason: string }) =>
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
