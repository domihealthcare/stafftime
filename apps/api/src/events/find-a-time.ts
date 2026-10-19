import { clashFor, Rule } from '../availability/availability.rules';
import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';

/**
 * "Find a time" (October 2026, Dominguez): when a manager books a meeting,
 * the times in the next few weeks that suit everybody it is for - going by
 * what the app knows: the rota, time off, availability and the other
 * meetings they are in. It cannot see anybody's own calendar.
 *
 * Best first: nobody off or in another meeting, nothing to check, and as many
 * as possible already on the rota then (at work, so nobody comes in for it);
 * weekdays before weekends, then earliest. Suggests, never decides - the
 * manager picks one and can still type any time.
 *
 * Pure: `find-a-time.service.ts` loads the people.
 */

/// The part of each day searched, on the practice's clock.
export const SEARCH_FROM = '07:00';
export const SEARCH_UNTIL = '19:00';
/// Meetings start on the hour or half past.
export const STEP_MINUTES = 30;
/// How many times are suggested, and how many on any one day.
export const MAX_SUGGESTIONS = 6;
const MAX_PER_DAY = 2;

export interface TimePerson {
  id: string;
  name: string;
  /// Their shifts around the search, drafts included.
  shifts: { startsAt: Date; endsAt: Date }[];
  /// Time off touching the search, approved or still waiting on a manager.
  timeOff: { startDate: string; endDate: string; approved: boolean; halfDay: boolean }[];
  /// Other meetings they are in (not ones they said they can't go to).
  meetings: { startsAt: Date; endsAt: Date; title: string }[];
  /// What they have said they cannot do.
  rules: Rule[];
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /// On the practice's clock.
  date: string;
  startTime: string;
  endTime: string;
}

/// How one person stands at one time:
/// - `work`: on the rota for all of it;
/// - `free`: nothing in the way, but not on the rota then;
/// - `check`: could, with something to weigh first;
/// - `busy`: off that day, or in another meeting.
export type Standing = 'work' | 'free' | 'check' | 'busy';

export interface PersonAt {
  standing: Standing;
  /// Why, in the manager's words; absent for `work` and `free`.
  why?: string;
}

export interface Suggestion {
  startsAt: Date;
  endsAt: Date;
  /// Everybody looked at.
  total: number;
  /// How many are on the rota for all of it.
  atWork: number;
  /// Free, but not on the rota then.
  notOnRota: string[];
  /// Something to weigh: asked for the day off, a half day, said they can't.
  check: { name: string; why: string }[];
  /// Off, or in another meeting.
  busy: { name: string; why: string }[];
}

/// Every start time in the search: each day from `from` for `days` days,
/// on the hour and half hour from 7am, ending by 7pm, none in the past.
export function slotsToSearch(
  from: string,
  days: number,
  minutes: number,
  now: Date,
  zone: string,
): Slot[] {
  const slots: Slot[] = [];
  const [fromHour, fromMinute] = SEARCH_FROM.split(':').map(Number);
  const [untilHour, untilMinute] = SEARCH_UNTIL.split(':').map(Number);
  const first = fromHour * 60 + fromMinute;
  const last = untilHour * 60 + untilMinute - minutes;
  for (let day = 0; day < days; day += 1) {
    const date = addDaysTo(from, day);
    for (let start = first; start <= last; start += STEP_MINUTES) {
      const startsAt = zonedTimeToUtc(date, clock(start), zone);
      if (startsAt < now) continue;
      const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
      slots.push({
        startsAt,
        endsAt,
        date,
        startTime: localTimeIn(startsAt, zone),
        endTime: localTimeIn(endsAt, zone),
      });
    }
  }
  return slots;
}

/// One person at one time. The most serious thing wins.
export function standingAt(person: TimePerson, slot: Slot): PersonAt {
  const overlaps = (span: { startsAt: Date; endsAt: Date }) =>
    span.startsAt < slot.endsAt && span.endsAt > slot.startsAt;
  const onDay = person.timeOff.filter(
    (off) => off.startDate <= slot.date && slot.date <= off.endDate,
  );

  if (onDay.some((off) => off.approved && !off.halfDay)) {
    return { standing: 'busy', why: 'Off that day' };
  }
  const meeting = person.meetings.find(overlaps);
  if (meeting) return { standing: 'busy', why: `In “${meeting.title}”` };
  if (onDay.some((off) => off.approved)) {
    return { standing: 'check', why: 'Half day off' };
  }
  if (onDay.length > 0) {
    return { standing: 'check', why: 'Asked for that day off' };
  }

  const covered = person.shifts.some(
    (shift) => shift.startsAt <= slot.startsAt && shift.endsAt >= slot.endsAt,
  );
  if (covered) return { standing: 'work' };
  if (person.shifts.some(overlaps)) {
    return { standing: 'check', why: 'On the rota for only part of it' };
  }
  const clash = clashFor(person.rules, {
    date: slot.date,
    startTime: slot.startTime,
    // A slot ending at midnight belongs to its day.
    endTime: slot.endTime === '00:00' ? '24:00' : slot.endTime,
  });
  if (clash) return { standing: 'check', why: clash };
  return { standing: 'free' };
}

/// Everybody at one time.
export function judgeSlot(slot: Slot, people: TimePerson[]): Suggestion {
  const suggestion: Suggestion = {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    total: people.length,
    atWork: 0,
    notOnRota: [],
    check: [],
    busy: [],
  };
  for (const person of people) {
    const at = standingAt(person, slot);
    if (at.standing === 'work') suggestion.atWork += 1;
    else if (at.standing === 'free') suggestion.notOnRota.push(person.name);
    else if (at.standing === 'check') suggestion.check.push({ name: person.name, why: at.why! });
    else suggestion.busy.push({ name: person.name, why: at.why! });
  }
  return suggestion;
}

/**
 * The best few times, best first: fewest busy, then fewest to check, then
 * most at work, then a weekday, then earliest. At most two on any one day,
 * and never two that overlap, so the list offers a real choice rather than
 * 9:00, 9:30 and 10:00 on the same Tuesday.
 */
export function findTimes(slots: Slot[], people: TimePerson[], zone: string): Suggestion[] {
  const judged = slots.map((slot) => ({ slot, suggestion: judgeSlot(slot, people) }));
  const weekend = (date: string) => (isoWeekdayOf(date) >= 6 ? 1 : 0);
  judged.sort(
    (a, b) =>
      a.suggestion.busy.length - b.suggestion.busy.length ||
      a.suggestion.check.length - b.suggestion.check.length ||
      b.suggestion.atWork - a.suggestion.atWork ||
      weekend(a.slot.date) - weekend(b.slot.date) ||
      a.slot.startsAt.getTime() - b.slot.startsAt.getTime(),
  );

  const chosen: { slot: Slot; suggestion: Suggestion }[] = [];
  for (const candidate of judged) {
    if (chosen.length >= MAX_SUGGESTIONS) break;
    const sameDay = chosen.filter(
      (taken) => localDateIn(taken.slot.startsAt, zone) === candidate.slot.date,
    );
    if (sameDay.length >= MAX_PER_DAY) continue;
    if (
      sameDay.some(
        (taken) =>
          taken.slot.startsAt < candidate.slot.endsAt &&
          taken.slot.endsAt > candidate.slot.startsAt,
      )
    ) {
      continue;
    }
    chosen.push(candidate);
  }
  return chosen.map((taken) => taken.suggestion);
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
