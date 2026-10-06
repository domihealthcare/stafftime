/// All API timestamps are UTC ISO strings. Rendering uses the viewer's own
/// timezone, which is correct today (both offices are Eastern) and stays correct
/// if a location is ever opened elsewhere.

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/// The shortest honest way to say a time: "9am", "1:30pm". For places where a
/// full "9:00 AM" would not fit — a month grid column is about fifty pixels on
/// a phone — and where the minutes are usually zero anyway.
export function formatTimeCompact(iso: string): string {
  const date = new Date(iso);
  const full = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  // Drop ":00" and the space before am/pm, in whatever form the locale used.
  return full.replace(/:00/, '').replace(/\s+/g, '').toLowerCase();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * A calendar day — a hire date, a due date, the first day of a holiday.
 *
 * Rendered in UTC on purpose. The API sends these as midnight UTC, so letting
 * the viewer's timezone apply would show "Mar 1" as "Feb 28" to everybody in
 * New Jersey. A day is a day wherever you are reading it from.
 *
 * The year is included by default: a checklist due date can easily be in a
 * different year from the one you are looking at it in.
 */
export function formatCalendarDate(iso: string, { year = true }: { year?: boolean } = {}): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
  });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

/// "7h 32m" — how long a punch lasted, or has lasted so far.
export function formatDuration(fromIso: string, toIso: string | null): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.floor((to - from) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/// Decimal hours, as payroll counts them.
export function durationHours(fromIso: string, toIso: string | null): number {
  if (!toIso) {
    return 0;
  }
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, ms / 3_600_000);
}

/// <input type="datetime-local"> wants local wall-clock time, not UTC.
///
/// Seconds are included (and the input given step="1") so that opening an edit
/// dialog and saving an untouched field cannot silently shift the timestamp —
/// which, on a short punch, would round clock-out back onto clock-in.
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${ymd}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/// The Sunday on or before a date: weeks on screen run Sunday to Saturday,
/// which is how the practice reads a calendar (asked for by Dominguez,
/// September 2026).
///
/// On screen only. Overtime weeks start on the pay period's weekday, on the
/// server, and nothing about pay moved with this.
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

/// The days of the week in the order the screens show them, Sunday first, as
/// the API numbers them: 1 = Monday … 7 = Sunday.
export const WEEK_ORDER = [7, 1, 2, 3, 4, 5, 6] as const;

/// Indexed by the API's number less one: WEEKDAY_NAMES[0] is Monday.
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(1);
  return result;
}

/// The month a week belongs to, for switching between Week and Month: the
/// month today is in when the week holds today, otherwise the month holding
/// most of it (its Wednesday). Not the month the week starts in — on Thursday
/// 1 October that week starts on Sunday 27 September, and Month opened on
/// September.
export function monthOfWeek(weekStart: Date, today: Date = new Date()): Date {
  const start = startOfWeek(weekStart);
  if (today >= start && today < addDays(start, 7)) return startOfMonth(today);
  return startOfMonth(addDays(start, 3));
}

/// Steps whole months from the first of a month.
///
/// Always call it on a date that is already the first. `setMonth` on the 31st
/// rolls into the next month — 31 January plus one month is 3 March — and a
/// schedule that skips February is a memorable bug.
export function addMonths(date: Date, months: number): Date {
  const result = startOfMonth(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/// The Sunday-to-Saturday grid that contains a whole month: five or six full
/// weeks, so every row has seven days and the month sits inside it.
export function monthGrid(monthStart: Date): Date[] {
  const first = startOfWeek(startOfMonth(monthStart));
  const monthEnd = addMonths(monthStart, 1);

  const days: Date[] = [];
  for (let day = first; day < monthEnd || days.length % 7 !== 0; day = addDays(day, 1)) {
    days.push(day);
    // A runaway loop here would hang the browser rather than fail loudly. Six
    // rows is the most any month needs; breaking at exactly 42 keeps the whole
    // -weeks promise that the grid's layout depends on.
    if (days.length === 42) break;
  }
  return days;
}

/// A date as the person looking at the screen would write it, not as UTC would.
///
/// `toISOString().slice(0, 10)` is the tempting version and is wrong east of
/// UTC: local midnight there is the previous day in UTC, so a week starting
/// Monday is sent to the server as starting Sunday. Nobody at Domi would ever
/// see it; somebody testing from Europe would, and be very confused.
export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/// "2026-10-14" as that day at local midnight, not UTC — a week that starts
/// on Sunday must not show as Saturday west of Greenwich. Null for anything else.
export function parseDay(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(day.getTime()) ? null : day;
}

/// A wall-clock "08:30", as a shift's repeating hours are kept → "8:30 AM".
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/// What colleagues call somebody: the name they go by, then their surname.
export function displayName(person: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return `${person.preferredName ?? person.firstName} ${person.lastName}`;
}
