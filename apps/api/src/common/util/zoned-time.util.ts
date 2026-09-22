/**
 * Converting a local wall-clock time in a named timezone to a UTC instant.
 *
 * This matters for repeating shifts. "9am every Tuesday" is a wall-clock time:
 * before the clocks change it is 13:00 UTC in New Jersey, after it is 14:00.
 * Storing a fixed offset would silently move everyone's shift by an hour twice
 * a year.
 *
 * Node has no built-in for local-to-UTC in an arbitrary zone — `Intl` only goes
 * the other way — so the offset is found by asking what the wall clock reads at
 * a guessed instant and correcting.
 */

/// The offset, in minutes, that `zone` is ahead of UTC at `instant`.
export function offsetMinutesAt(instant: Date, zone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );

  // What the wall clock in `zone` reads, expressed as if it were UTC.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as 24 in some environments.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * The instant at which the wall clock in `zone` reads the given local date and
 * time.
 *
 * `date` is "2026-11-03", `time` is "09:00" or "09:00:00".
 *
 * Two passes: guess that the local time is UTC, measure the offset there, then
 * correct and re-measure. The second pass matters within an hour of a clock
 * change, where the first guess can land on the wrong side of it.
 */
export function zonedTimeToUtc(date: string, time: string, zone: string): Date {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);

  if ([year, month, day, hour, minute, second].some((value) => !Number.isFinite(value))) {
    throw new Error(`Cannot read "${date} ${time}" as a date and time`);
  }

  const naive = Date.UTC(year, month - 1, day, hour, minute, second);

  let instant = new Date(naive - offsetMinutesAt(new Date(naive), zone) * 60_000);
  // Re-measure at the corrected instant; if the offset differs we crossed a
  // transition, so correct again from the same starting point.
  const corrected = offsetMinutesAt(instant, zone);
  instant = new Date(naive - corrected * 60_000);

  return instant;
}

/// "2026-11-03" for the calendar day `instant` falls on in `zone`.
export function localDateIn(instant: Date, zone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/// 1 = Monday … 7 = Sunday, for the calendar day `date` names. Matches ISO-8601
/// so a "days of week" list reads the way a rota does.
export function isoWeekdayOf(date: string): number {
  const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/// Every calendar date from `from` to `until` inclusive, as "YYYY-MM-DD".
/// Walked in UTC so a clock change cannot skip or repeat a day.
export function datesBetween(from: string, until: string): string[] {
  const start = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${until.slice(0, 10)}T00:00:00.000Z`);

  const dates: string[] = [];
  for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

/// Adds whole days to a "YYYY-MM-DD", in UTC.
export function addDaysTo(date: string, days: number): string {
  const shifted = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
