import { DowntimeCause, DowntimeSystem, Role } from '@prisma/client';
import {
  PRACTICE_ZONE,
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';

/**
 * The rules of a downtime (October 2026, Dominguez), kept pure so they are
 * tested on their own: how it is described, who is told and when, when the
 * catch-up is due, when the paper can be shredded, when the monthly check is
 * asked for, and the log's summary. The reading and writing is in
 * `downtime.service.ts`.
 */

/// How each system reads in a sentence.
export const SYSTEM_WORDS: Record<DowntimeSystem, string> = {
  ECW: 'eCW',
  PHONES: 'the phones',
  INTERNET: 'the internet',
};

/// How each system reads as a label (a tick box, a column).
export const SYSTEM_LABELS: Record<DowntimeSystem, string> = {
  ECW: 'eCW',
  PHONES: 'Phones (Weave)',
  INTERNET: 'Internet',
};

export const CAUSE_LABELS: Record<DowntimeCause, string> = {
  ECW_OUTAGE: 'eCW outage',
  INTERNET_PROVIDER: 'Internet provider',
  POWER: 'Power',
  WEAVE: 'Weave',
  PLANNED_MAINTENANCE: 'Planned maintenance',
  OTHER: 'Other',
};

const SYSTEM_ORDER: DowntimeSystem[] = [
  DowntimeSystem.ECW,
  DowntimeSystem.PHONES,
  DowntimeSystem.INTERNET,
];

/// "eCW", "eCW and the phones", "eCW, the phones and the internet".
export function systemsWords(systems: DowntimeSystem[]): string {
  const words = SYSTEM_ORDER.filter((system) => systems.includes(system)).map(
    (system) => SYSTEM_WORDS[system],
  );
  if (words.length === 0) return 'Something';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/// "is down" for one thing, "are down" for several or the phones.
export function isOrAre(systems: DowntimeSystem[]): string {
  const several = systems.length > 1 || (systems.length === 1 && systems[0] === 'PHONES');
  return several ? 'are' : 'is';
}

/// "North Bergen", "both offices" (every office the practice has).
export function officesWords(names: string[], officeCount: number): string {
  if (names.length === 0) return 'the practice';
  if (names.length >= officeCount && officeCount > 1) return 'both offices';
  const sorted = [...names].sort();
  if (sorted.length === 1) return sorted[0];
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/// The start of a sentence: "The phones", but "eCW" as eCW writes itself.
export function sentenceStart(words: string): string {
  return words.startsWith('the ') ? `T${words.slice(1)}` : words;
}

/// "eCW is down at North Bergen", the words a downtime goes by.
export function headline(systems: DowntimeSystem[], offices: string): string {
  return `${sentenceStart(systemsWords(systems))} ${isOrAre(systems)} down at ${offices}`;
}

/// "2 hours 15 minutes", "45 minutes", "1 day 3 hours".
export function durationWords(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} ${whole === 1 ? 'minute' : 'minutes'}`;
  const days = Math.floor(whole / 1440);
  const hours = Math.floor((whole % 1440) / 60);
  const mins = whole % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (!days && mins) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

export const minutesBetween = (from: Date, to: Date) =>
  Math.max(0, (to.getTime() - from.getTime()) / 60_000);

/// "9:10 AM" on the practice's clock.
export function clockWords(instant: Date): string {
  return instant.toLocaleTimeString('en-US', {
    timeZone: PRACTICE_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/// "Mon, Oct 26" on the practice's calendar.
export function dayWords(instant: Date): string {
  return instant.toLocaleDateString('en-US', {
    timeZone: PRACTICE_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/// A "YYYY-MM-DD" as "Mon, Oct 26".
export function dateWords(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ------------------------------------------------------------ catching up

/// How long a downtime can be and still be caught up the same day.
export const SAME_DAY_HOURS = 4;
/// How long a downtime can be and still be caught up by the next working day.
export const NEXT_DAY_HOURS = 24;
/// How long the scanned paper is kept before it is shredded (Dominguez: "2
/// wks is fine").
export const SHRED_AFTER_DAYS = 14;

export type CatchUp =
  | { kind: 'SAME_DAY'; dueOn: string }
  | { kind: 'NEXT_WORKING_DAY'; dueOn: string }
  | { kind: 'PLAN' };

/// The next Monday to Friday after `date`.
export function nextWorkingDay(date: string): string {
  let next = addDaysTo(date, 1);
  while (isoWeekdayOf(next) > 5) next = addDaysTo(next, 1);
  return next;
}

/**
 * When the catch-up is due, by how long it was down (Dominguez: "an hour of
 * downtime catching it up is different from 2 days"): under 4 hours, the same
 * day; up to a day, the end of the next working day; longer, the manager
 * writes a plan when closing it.
 */
export function catchUpFor(startedAt: Date, endedAt: Date): CatchUp {
  const hours = minutesBetween(startedAt, endedAt) / 60;
  const endDay = localDateIn(endedAt, PRACTICE_ZONE);
  if (hours < SAME_DAY_HOURS) return { kind: 'SAME_DAY', dueOn: endDay };
  if (hours <= NEXT_DAY_HOURS) return { kind: 'NEXT_WORKING_DAY', dueOn: nextWorkingDay(endDay) };
  return { kind: 'PLAN' };
}

/// The day the paper from a downtime caught up on `caughtUpAt` may go.
export function shredOn(caughtUpAt: Date): string {
  return addDaysTo(localDateIn(caughtUpAt, PRACTICE_ZONE), SHRED_AFTER_DAYS);
}

// ------------------------------------------------------------- who is told

/// How long before a shift somebody on it is told of a downtime already going
/// on: they hear before they set out, not at midnight.
export const TELL_HOURS_AHEAD = 2;

export interface ShiftTimes {
  startsAt: Date;
  endsAt: Date;
}

/// When "today" ends at the practice, for `now`.
export function endOfPracticeDay(now: Date): Date {
  return zonedTimeToUtc(addDaysTo(localDateIn(now, PRACTICE_ZONE), 1), '00:00', PRACTICE_ZONE);
}

/**
 * Whether somebody on this shift is told of a downtime (Dominguez: "it
 * should put notifications for employees who have a shift now or upcoming
 * today"). When it starts: anybody whose shift today has not ended. Later -
 * a shift added since, or the next day of a long one - two hours before it
 * starts, or now if it is already on.
 */
export function shouldTell(shift: ShiftTimes, now: Date, atStart: boolean): boolean {
  if (shift.endsAt <= now) return false;
  const until = atStart
    ? endOfPracticeDay(now)
    : new Date(now.getTime() + TELL_HOURS_AHEAD * 3_600_000);
  return shift.startsAt < until;
}

/// The hour the evening-before notice of a planned downtime goes, as for
/// "You're on tomorrow".
export const AHEAD_NOTICE_TIME = '18:00';

/// When the people working during a planned downtime are told of it: 6pm the
/// evening before it starts (or at once, when it is entered later than that).
export function aheadNoticeFrom(startsAt: Date): Date {
  return zonedTimeToUtc(
    addDaysTo(localDateIn(startsAt, PRACTICE_ZONE), -1),
    AHEAD_NOTICE_TIME,
    PRACTICE_ZONE,
  );
}

export function aheadNoticeDue(startsAt: Date, now: Date): boolean {
  return now >= aheadNoticeFrom(startsAt) && now < startsAt;
}

/// The stretch a planned downtime covers, for whose shifts it touches: to its
/// expected end, or the end of the day it starts.
export function plannedWindow(
  startsAt: Date,
  plannedEndsAt: Date | null,
): { from: Date; to: Date } {
  return { from: startsAt, to: plannedEndsAt ?? endOfPracticeDay(startsAt) };
}

export const overlaps = (shift: ShiftTimes, window: { from: Date; to: Date }) =>
  shift.startsAt < window.to && shift.endsAt > window.from;

// --------------------------------------------------------- the monthly check

/// The hour the monthly check is asked for.
export const CHECK_HOUR = '09:00';
/// The days of the month it is asked for: the 1st, and again a week on for
/// anybody who has not done it.
export const CHECK_DAYS = [1, 8];

/// The first of the month `now` is in at the practice, "YYYY-MM-01".
export function monthOf(now: Date): string {
  return `${localDateIn(now, PRACTICE_ZONE).slice(0, 7)}-01`;
}

/// How many days after its day a round of the check may still go, should
/// the timer miss it - and no later, so the check does not go out the moment
/// this is first switched on near the end of a month.
export const CHECK_SEND_DAYS = 3;

/// Which round of this month's check is due by `now`: 1 from 9am on the 1st,
/// 2 from 9am on the 8th, each for three days. None in between.
export function checkRoundsDue(now: Date): number[] {
  const today = localDateIn(now, PRACTICE_ZONE);
  const day = Number(today.slice(8, 10));
  const pastHour = localTimeIn(now, PRACTICE_ZONE) >= CHECK_HOUR;
  return CHECK_DAYS.map((startDay, index) => ({ round: index + 1, startDay }))
    .filter(
      ({ startDay }) =>
        (day > startDay || (day === startDay && pastHour)) && day - startDay < CHECK_SEND_DAYS,
    )
    .map(({ round }) => round);
}

/// An NPI's check digit, by the Luhn rule with the 80840 prefix. It caught
/// the wrong NPI on the old paper pads.
export function npiIsValid(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi}`.split('').map(Number).reverse();
  const total = digits.reduce((sum, digit, index) => {
    if (index % 2 === 0) return sum + digit;
    const doubled = digit * 2;
    return sum + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return total % 10 === 0;
}

/// Who is asked to do the monthly check (Dominguez: "should go to all the
/// admin"): admins, and the admin team - anybody holding a job role whose
/// name starts "Admin" (Administrative).
export function asksForCheck(person: { role: Role; jobRoleNames: string[] }): boolean {
  return person.role === Role.ADMIN || person.jobRoleNames.some((name) => /^admin/i.test(name));
}

// -------------------------------------------------------------- the summary

export interface LoggedDowntime {
  systems: DowntimeSystem[];
  cause: DowntimeCause | null;
  startsAt: Date;
  endedAt: Date | null;
  offices: string[];
}

export interface DowntimeSummary {
  count: number;
  minutes: number;
  byCause: { cause: DowntimeCause | null; label: string; count: number; minutes: number }[];
  bySystem: { system: DowntimeSystem; label: string; count: number; minutes: number }[];
  byOffice: { office: string; count: number; minutes: number }[];
  longestMinutes: number;
}

/// A year of closed downtimes, added up (Dominguez: "a log summary"): how
/// many, how long, by cause, by what was down and by office. Most first.
export function summarise(downtimes: LoggedDowntime[]): DowntimeSummary {
  const closed = downtimes.filter((row) => row.endedAt);
  const lengthOf = (row: LoggedDowntime) => minutesBetween(row.startsAt, row.endedAt as Date);
  const tally = <K>(keyOf: (row: LoggedDowntime) => K[]) => {
    const totals = new Map<K, { count: number; minutes: number }>();
    for (const row of closed) {
      for (const key of keyOf(row)) {
        const entry = totals.get(key) ?? { count: 0, minutes: 0 };
        entry.count += 1;
        entry.minutes += lengthOf(row);
        totals.set(key, entry);
      }
    }
    return [...totals.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  };
  return {
    count: closed.length,
    minutes: Math.round(closed.reduce((sum, row) => sum + lengthOf(row), 0)),
    byCause: tally((row) => [row.cause]).map(([cause, entry]) => ({
      cause,
      label: cause ? CAUSE_LABELS[cause] : 'Not given',
      count: entry.count,
      minutes: Math.round(entry.minutes),
    })),
    bySystem: tally((row) => row.systems).map(([system, entry]) => ({
      system,
      label: SYSTEM_LABELS[system],
      count: entry.count,
      minutes: Math.round(entry.minutes),
    })),
    byOffice: tally((row) => row.offices).map(([office, entry]) => ({
      office,
      count: entry.count,
      minutes: Math.round(entry.minutes),
    })),
    longestMinutes: Math.round(closed.reduce((most, row) => Math.max(most, lengthOf(row)), 0)),
  };
}

// --------------------------------------------------------- the nightly email

/// A downtime still open this long is probably one nobody closed.
export const STILL_OPEN_HOURS = 12;

export interface AttentionDowntime {
  systems: DowntimeSystem[];
  offices: string;
  startsAt: Date;
  announcedAt: Date | null;
  endedAt: Date | null;
  catchUpDueOn: string | null;
  caughtUpAt: Date | null;
  shreddedAt: Date | null;
}

/// What is worth a manager's look about the downtimes, for the nightly email
/// and the Downtime page's banner: one left open, a catch-up overdue, paper
/// that can now be shredded.
export function downtimeLines(rows: AttentionDowntime[], now: Date): string[] {
  const today = localDateIn(now, PRACTICE_ZONE);
  const lines: string[] = [];
  for (const row of rows) {
    const what = `${headline(row.systems, row.offices)} on ${dayWords(row.startsAt)}`;
    if (!row.endedAt) {
      if (row.announcedAt && minutesBetween(row.announcedAt, now) >= STILL_OPEN_HOURS * 60) {
        lines.push(
          `Still open: ${what}, since ${clockWords(row.startsAt)}. Close it once it is back`,
        );
      }
      continue;
    }
    if (!row.caughtUpAt) {
      if (row.catchUpDueOn && row.catchUpDueOn < today) {
        lines.push(`Catch-up not marked done: ${what}, due ${dateWords(row.catchUpDueOn)}`);
      }
      continue;
    }
    if (!row.shreddedAt && shredOn(row.caughtUpAt) <= today) {
      lines.push(`Paper can be shredded: ${what}`);
    }
  }
  return lines;
}

export interface AttentionCheck {
  office: string | null;
  who: string;
  lowItems: string[];
  feedback: string | null;
}

/// The monthly checks no manager has read yet: what is running low, and
/// anything said about the procedures.
export function checkLines(checks: AttentionCheck[]): string[] {
  const lines: string[] = [];
  for (const check of checks) {
    const where = check.office ? ` at ${check.office}` : '';
    if (check.lowItems.length > 0) {
      lines.push(`Running low${where}: ${check.lowItems.join(', ')} (${check.who})`);
    }
    const note = check.feedback?.trim();
    if (note) {
      const short = note.length > 90 ? `${note.slice(0, 89).trimEnd()}...` : note;
      lines.push(`From the monthly check${where} (${check.who}): "${short}"`);
    }
  }
  return lines;
}

// ------------------------------------------------------- the procedures

/// The headings of the downtime procedures (the guide's groups), one for
/// each kind of job. The "What to do" sheets print one each.
export const PROCEDURE_GROUPS = [
  'Front desk',
  'Medical assistant',
  'Provider',
  'Managers and admins',
] as const;

export interface HeldRole {
  name: string;
  usesClinicalForms: boolean;
  isPrimary: boolean;
}

/// Which procedures somebody sees first: their main job role's (a provider is
/// a job role with clinical forms), else the managers' for managers, admins
/// and the admin team, else the front desk's.
export function procedureGroupFor(person: { role: Role; jobRoles: HeldRole[] }): string {
  const held = [...person.jobRoles].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  for (const role of held) {
    if (role.usesClinicalForms) return 'Provider';
    if (/front\s*desk/i.test(role.name)) return 'Front desk';
    if (/medical\s*assistant|^ma$/i.test(role.name)) return 'Medical assistant';
    if (/^(admin|manager)/i.test(role.name)) return 'Managers and admins';
  }
  if (person.role === Role.MANAGER || person.role === Role.ADMIN) return 'Managers and admins';
  return 'Front desk';
}
