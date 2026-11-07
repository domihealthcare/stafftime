import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { DEFAULT_HAND_OVER, rotaOn, weekOfMonthOf } from './on-call';
import type { RotaRule } from './on-call';

/**
 * Who is on call at a moment, for the after-hours phone line (November 2026).
 *
 * CONTRACT, written first so the schedule API, the webhook and the screens
 * can be built at once. The bodies below are filled in by the lookup's own
 * work; the types and signatures are fixed.
 *
 * Order, first that applies wins:
 * 1. A time-range cover (`OnCallCover`) running at that moment. Where two
 *    overlap, the one made last (`createdAt`) wins.
 * 2. The turn's changed day (`OnCallDay`: a manager's change or a swap). The
 *    turn running is found with `turnDateAt` (before the hand-over it is
 *    still yesterday's).
 * 3. The usual pattern (`usualOn`).
 * 4. The default provider.
 * The backup comes from the same layer that chose the provider (a cover's, a
 * changed day's, the pattern entry's); the default provider has none. A
 * backup the same as the provider is dropped.
 *
 * All wall-clock times are New Jersey's (`PRACTICE_ZONE`), so a turn on the
 * night the clocks change is 23 or 25 hours long. Pure: no database.
 */

export interface LookupRotaEntry {
  weekday: number;
  weekOfMonth: number;
  employeeId: string;
  backupEmployeeId: string | null;
}

export interface LookupRota extends RotaRule {
  entries: LookupRotaEntry[];
}

export interface LookupDay {
  employeeId: string;
  backupEmployeeId: string | null;
  swapped: boolean;
}

export interface LookupCover {
  id: string;
  startsAt: Date;
  endsAt: Date;
  employeeId: string;
  backupEmployeeId: string | null;
  createdAt: Date;
}

export interface LookupData {
  rotas: LookupRota[];
  /// Changed days, keyed by their date "YYYY-MM-DD".
  days: Map<string, LookupDay>;
  covers: LookupCover[];
  defaultProviderId: string | null;
}

export type OnCallLayer = 'COVER' | 'CHANGED' | 'SWAPPED' | 'USUAL' | 'DEFAULT' | 'NONE';

export interface OnCallAnswer {
  employeeId: string | null;
  backupEmployeeId: string | null;
  source: OnCallLayer;
  /// The cover that decided it, when one did.
  coverId: string | null;
  /// The turn's date "YYYY-MM-DD" running at that moment (whatever decided).
  turnDate: string;
}

/// One stretch of time with the same answer, for the 60-day view.
export interface OnCallSegment extends OnCallAnswer {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Clock changes. A hand-over time is a New Jersey wall-clock time, turned into
 * an instant with `zonedTimeToUtc`. A time that does not exist (02:30 on the
 * spring-forward day) lands one hour early, on the same UTC reading (01:30
 * EST). A time that happens twice (01:30 on the fall-back day) is the first
 * one (EDT). The turn running is found by comparing instants, not "HH:MM"
 * strings (which go backwards when the hour repeats), so every moment has
 * exactly one answer and hand-overs only ever move forward.
 */
function handOverAt(date: string, rotas: RotaRule[]): Date {
  const changesAt = rotaOn(date, rotas)?.changesAt ?? DEFAULT_HAND_OVER;
  return zonedTimeToUtc(date, changesAt, PRACTICE_ZONE);
}

/// The date of the turn running at `at`: the latest day whose hand-over has passed.
/// The turn running at a moment: the latest date whose hand-over instant is at or
/// before it. Also what the On call screen calls "now", so the two agree.
export function turnDateOf(at: Date, rotas: RotaRule[]): string {
  const today = localDateIn(at, PRACTICE_ZONE);
  for (let back = 0; back <= 3; back++) {
    const date = addDaysTo(today, -back);
    if (handOverAt(date, rotas).getTime() <= at.getTime()) return date;
  }
  return addDaysTo(today, -3);
}

/// The most particular entry for a day: nth of the month, then last, then every week.
function entryOn(date: string, rota: LookupRota): LookupRotaEntry | null {
  const weekday = isoWeekdayOf(date);
  const { nth, last } = weekOfMonthOf(date);
  const forDay = rota.entries.filter((entry) => entry.weekday === weekday);
  return (
    forDay.find((entry) => entry.weekOfMonth === nth) ??
    (last ? forDay.find((entry) => entry.weekOfMonth === -1) : undefined) ??
    forDay.find((entry) => entry.weekOfMonth === 0) ??
    null
  );
}

function answer(
  employeeId: string | null,
  backup: string | null,
  source: OnCallLayer,
  coverId: string | null,
  turnDate: string,
): OnCallAnswer {
  return {
    employeeId,
    backupEmployeeId: employeeId && backup !== employeeId ? backup : null,
    source,
    coverId,
    turnDate,
  };
}

/// Who is on call at `at`.
export function whoIsOnCallAt(at: Date, data: LookupData): OnCallAnswer {
  const turnDate = turnDateOf(at, data.rotas);
  const t = at.getTime();

  let cover: LookupCover | null = null;
  for (const c of data.covers) {
    if (c.startsAt.getTime() <= t && t < c.endsAt.getTime()) {
      if (
        !cover ||
        c.createdAt.getTime() > cover.createdAt.getTime() ||
        (c.createdAt.getTime() === cover.createdAt.getTime() && c.id > cover.id)
      ) {
        cover = c;
      }
    }
  }
  if (cover) return answer(cover.employeeId, cover.backupEmployeeId, 'COVER', cover.id, turnDate);

  const day = data.days.get(turnDate);
  if (day) {
    return answer(
      day.employeeId,
      day.backupEmployeeId,
      day.swapped ? 'SWAPPED' : 'CHANGED',
      null,
      turnDate,
    );
  }

  const rota = rotaOn(turnDate, data.rotas) as LookupRota | null;
  const entry = rota ? entryOn(turnDate, rota) : null;
  if (entry) return answer(entry.employeeId, entry.backupEmployeeId, 'USUAL', null, turnDate);

  if (data.defaultProviderId)
    return answer(data.defaultProviderId, null, 'DEFAULT', null, turnDate);
  return answer(null, null, 'NONE', null, turnDate);
}

/// The answer from `from` to `to`, as back-to-back stretches: a new one
/// starts at every hand-over and every cover's start or end, and neighbours
/// with the same answer are joined.
export function segmentsBetween(from: Date, to: Date, data: LookupData): OnCallSegment[] {
  const start = from.getTime();
  const end = to.getTime();
  if (end <= start) return [];

  const marks = new Set<number>();
  const lastDate = localDateIn(to, PRACTICE_ZONE);
  for (
    let date = addDaysTo(localDateIn(from, PRACTICE_ZONE), -2);
    date <= addDaysTo(lastDate, 1);
    date = addDaysTo(date, 1)
  ) {
    marks.add(handOverAt(date, data.rotas).getTime());
  }
  for (const c of data.covers) {
    marks.add(c.startsAt.getTime());
    marks.add(c.endsAt.getTime());
  }
  const cuts = [...marks].filter((m) => m > start && m < end).sort((a, b) => a - b);
  cuts.unshift(start);
  cuts.push(end);

  const segments: OnCallSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const startsAt = new Date(cuts[i]);
    const found = whoIsOnCallAt(startsAt, data);
    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.employeeId === found.employeeId &&
      previous.backupEmployeeId === found.backupEmployeeId &&
      previous.source === found.source &&
      previous.coverId === found.coverId &&
      previous.turnDate === found.turnDate
    ) {
      previous.endsAt = new Date(cuts[i + 1]);
    } else {
      segments.push({ ...found, startsAt, endsAt: new Date(cuts[i + 1]) });
    }
  }
  return segments;
}
