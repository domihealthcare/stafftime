import type {
  Employee,
  EmployeeSummary,
  Location,
  Shift,
  TimeEntry,
} from './types';

const DEV_USER_STORAGE_KEY = 'stafftime.devEmployeeId';

/**
 * Who the app is acting as.
 *
 * While authentication is stubbed the API identifies the caller from a header
 * rather than a session, so the choice lives in localStorage. When real login
 * lands this file is the only place that changes: `authHeaders()` starts
 * returning a bearer token and the rest of the app is untouched.
 */
export function getDevEmployeeId(): string | null {
  try {
    return localStorage.getItem(DEV_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDevEmployeeId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(DEV_USER_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(DEV_USER_STORAGE_KEY);
    }
  } catch {
    // Private browsing with storage blocked — the session just will not persist.
  }
}

function authHeaders(): Record<string, string> {
  const id = getDevEmployeeId();
  return id ? { 'x-dev-employee-id': id } : {};
}

/// An error carrying the API's own message, so the UI can show the real reason
/// a clock-in was refused rather than a generic failure.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
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
    throw new ApiError(response.status, extractMessage(body, response.status));
  }

  return body as T;
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

export const api = {
  // Development only — disappears with real login.
  listDevEmployees: () => request<EmployeeSummary[]>('/dev/employees'),

  me: () => request<Employee>('/employees/me'),
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
