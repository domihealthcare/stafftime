import type { Role } from './types';

/**
 * View as (October 2026, Dominguez: "me (as the super admin) should have a
 * way to see the views that other staff have ... to make sure build is
 * correct, and to show staff how to do certain tasks"): an admin chooses an
 * access level (Employee or Manager) and, if they like, job roles, and from
 * then on this browser tab asks the server to treat them so - by two request
 * headers the session guard honours only for an admin, and only downwards.
 * Kept per tab (`sessionStorage`), so closing the tab ends it; the banner
 * under the header says it is on and takes them back.
 */
export interface ViewAs {
  role: Extract<Role, 'EMPLOYEE' | 'MANAGER'>;
  jobRoleIds: string[];
}

const KEY = 'domi-staff.view-as';

export function readViewAs(): ViewAs | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewAs>;
    if (parsed.role !== 'EMPLOYEE' && parsed.role !== 'MANAGER') return null;
    return {
      role: parsed.role,
      jobRoleIds: Array.isArray(parsed.jobRoleIds) ? parsed.jobRoleIds : [],
    };
  } catch {
    return null;
  }
}

export function writeViewAs(value: ViewAs | null) {
  try {
    if (value) window.sessionStorage.setItem(KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice simply does not stick, and nothing breaks.
  }
}

/// The headers every request carries while viewing as somebody.
export function viewAsHeaders(): Record<string, string> {
  const value = readViewAs();
  if (!value) return {};
  return {
    'x-view-as': value.role,
    ...(value.jobRoleIds.length > 0 ? { 'x-view-as-job-roles': value.jobRoleIds.join(',') } : {}),
  };
}
