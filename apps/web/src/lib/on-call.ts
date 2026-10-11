/**
 * The on-call schedule's words, the same as the API's `on-call/on-call.ts`.
 */
export const WEEKDAYS = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/// "Mondays", "the 4th Saturday", "the last Friday".
export function entryWords(weekday: number, weekOfMonth: number): string {
  if (weekOfMonth === 0) return `${WEEKDAYS[weekday]}s`;
  const which = weekOfMonth === -1 ? 'last' : ['', '1st', '2nd', '3rd', '4th'][weekOfMonth];
  return `the ${which} ${WEEKDAYS[weekday]}`;
}

/// "12:00" → "12 PM", "08:30" → "8:30 AM".
export function clockWords(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
}

/// Providers, managers and admins see the schedule.
export function canSeeOnCall(
  employee: { role: string; usesClinicalForms?: boolean } | null | undefined,
): boolean {
  if (!employee) return false;
  return (
    employee.usesClinicalForms === true || employee.role === 'MANAGER' || employee.role === 'ADMIN'
  );
}
