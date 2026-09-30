import type { Shift } from './types';

/// The Schedule's location filter value for "Work from home". The same value
/// the shift forms' Location list uses (`components/PlaceSelect.tsx`).
export const WORK_FROM_HOME_FILTER = 'wfh';

/**
 * Whether a shift is at the place the Schedule is narrowed to (Dominguez,
 * September 2026). An office means at that office: a work-from-home shift is
 * counted under the person's main office for reports and payroll, but nobody
 * is there, so it does not show under it. "Work from home" shows only those.
 */
export function atPlace(shift: Pick<Shift, 'locationId' | 'isRemote'>, place: string): boolean {
  if (!place) return true;
  if (place === WORK_FROM_HOME_FILTER) return Boolean(shift.isRemote);
  return shift.locationId === place && !shift.isRemote;
}

/**
 * Whether a shift belongs under a job role. A shift carries the role it is
 * for — always one its person holds — so that decides: a provider's
 * administrative shift is not a Provider shift. A shift saved before roles
 * were required, with none, falls back to whether its person is in the role;
 * an open shift with none is for no role in particular.
 */
export function forRole(
  shift: Pick<Shift, 'employeeId' | 'jobRoleId'>,
  roleId: string,
  members: Set<string>,
): boolean {
  if (!roleId) return true;
  if (shift.jobRoleId) return shift.jobRoleId === roleId;
  return shift.employeeId !== null && members.has(shift.employeeId);
}
