import { PayType, PtoStatus } from '@prisma/client';
import { clashFor, Rule, twelveHour } from '../availability/availability.rules';
import { overtimeLevel, OvertimeLevel } from './overtime.service';

/// How well somebody fits a shift that needs covering:
/// - `good`: free, not off, not past what they said they can do, and not
///   pushed near overtime — say yes without a second thought;
/// - `catch`: could do it, but there is something to weigh first;
/// - `cannot`: already working then, or on approved time off.
export type CoverFit = 'good' | 'catch' | 'cannot';

export interface CoverOption {
  employeeId: string;
  name: string;
  fit: CoverFit;
  /// The week's scheduled hours (every office, drafts included) without this
  /// shift, and with it — the week the overtime rules count.
  hoursBefore: number;
  hoursAfter: number;
  /// Overtime is an hourly question, as everywhere else.
  hourly: boolean;
  overtime: OvertimeLevel;
  /// What stands in the way, or is worth knowing, in the manager's words —
  /// most serious first. Empty for a good fit.
  reasons: CoverReason[];
  /// Other shifts that day that do not clash — "Also on 7:00 AM–12:00 PM".
  sameDay: string[];
  /// Already on this shift (when changing who works it).
  current: boolean;
}

/// `shift`: already working then; `leave`: approved time off; `asked-off`:
/// a request not decided yet, or a half day; `availability`: said they
/// cannot; `overtime`: near or past the line.
export interface CoverReason {
  kind: 'shift' | 'leave' | 'asked-off' | 'availability' | 'overtime';
  text: string;
}

export interface CoverOptions {
  weekStart: string;
  thresholdHours: number;
  options: CoverOption[];
}

/// One person who could be asked, with what the database knows about them
/// around the shift's day.
export interface CoverCandidate {
  id: string;
  firstName: string;
  preferredName: string | null;
  lastName: string;
  payType: PayType;
  /// Their other shifts in the overtime week (this one left out).
  shifts: {
    startsAt: Date;
    endsAt: Date;
    /// Local to the office, for saying it back.
    date: string;
    startTime: string;
    endTime: string;
    place: string;
  }[];
  /// Time off covering the shift's day, approved or waiting on a manager.
  timeOff: { type: string; status: PtoStatus; isHalfDay: boolean }[];
  /// What they have said they cannot do.
  rules: Rule[];
}

/// The shift being covered, in the office's own terms.
export interface CoverTarget {
  employeeId: string | null;
  startsAt: Date;
  endsAt: Date;
  date: string;
  startTime: string;
  /// "24:00" when it runs past midnight, as the availability check wants.
  endTime: string;
}

const FIT_ORDER: Record<CoverFit, number> = { good: 0, catch: 1, cannot: 2 };

/**
 * Who could cover a shift, best first.
 *
 * Good fits first, then the ones with a catch (the lighter catch first —
 * near overtime before past it, one worry before two), then those who cannot.
 * Within each, whoever has fewest hours that week comes first: it spreads the
 * work, and it is the person furthest from overtime. Then by name, so the
 * list does not shuffle between two looks.
 *
 * Never a refusal: a manager can still pick anybody the list shows as
 * "cannot" from the full list, and the usual warnings follow — this only
 * says who to ask first, and why.
 */
export function rankCoverOptions(
  target: CoverTarget,
  candidates: CoverCandidate[],
  thresholdHours: number,
): CoverOption[] {
  const length = hoursBetween(target.startsAt, target.endsAt);

  const options = candidates.map((person) => {
    const blockers: CoverReason[] = [];
    const worries: (CoverReason & { weight: number })[] = [];

    const clashing = person.shifts.filter(
      (other) => other.startsAt < target.endsAt && other.endsAt > target.startsAt,
    );
    for (const other of clashing) {
      blockers.push({
        kind: 'shift',
        text: `Already on ${twelveHour(other.startTime)}–${twelveHour(other.endTime)} (${other.place})`,
      });
    }

    for (const off of person.timeOff) {
      const what = off.type === 'VACATION' ? 'PTO' : sentenceCase(off.type);
      if (off.status === PtoStatus.APPROVED && !off.isHalfDay) {
        blockers.push({ kind: 'leave', text: `Off that day (${what})` });
      } else if (off.status === PtoStatus.APPROVED) {
        worries.push({ kind: 'asked-off', text: `Half day off (${what})`, weight: 2 });
      } else {
        worries.push({
          kind: 'asked-off',
          text: `Asked for that day off (${what}, not decided yet)`,
          weight: 2,
        });
      }
    }

    const clash = clashFor(person.rules, target);
    if (clash) worries.push({ kind: 'availability', text: clash, weight: 2 });

    const hoursBefore = round2(
      person.shifts.reduce((sum, other) => sum + hoursBetween(other.startsAt, other.endsAt), 0),
    );
    const hoursAfter = round2(hoursBefore + length);
    const hourly = person.payType === PayType.HOURLY;
    const overtime = hourly ? overtimeLevel(hoursAfter, thresholdHours) : 'ok';
    if (overtime === 'over') {
      worries.push({
        kind: 'overtime',
        text: `Overtime: ${hoursWord(hoursAfter)} that week, ${hoursWord(hoursAfter - thresholdHours)} past ${thresholdHours}`,
        weight: 3,
      });
    } else if (overtime === 'near') {
      worries.push({
        kind: 'overtime',
        text: `Close to overtime: ${hoursWord(hoursAfter)} that week`,
        weight: 1,
      });
    }

    const sameDay = person.shifts
      .filter((other) => other.date === target.date && !clashing.includes(other))
      .map(
        (other) =>
          `Also on ${twelveHour(other.startTime)}–${twelveHour(other.endTime)} (${other.place})`,
      );

    const fit: CoverFit = blockers.length > 0 ? 'cannot' : worries.length > 0 ? 'catch' : 'good';
    return {
      option: {
        employeeId: person.id,
        name: `${person.preferredName ?? person.firstName} ${person.lastName}`,
        fit,
        hoursBefore,
        hoursAfter,
        hourly,
        overtime,
        reasons: [
          ...blockers,
          ...[...worries]
            .sort((a, b) => b.weight - a.weight)
            .map(({ kind, text }) => ({ kind, text })),
        ],
        sameDay,
        current: person.id === target.employeeId,
      } satisfies CoverOption,
      weight: worries.reduce((sum, worry) => sum + worry.weight, 0),
    };
  });

  return options
    .sort(
      (a, b) =>
        FIT_ORDER[a.option.fit] - FIT_ORDER[b.option.fit] ||
        a.weight - b.weight ||
        a.option.hoursBefore - b.option.hoursBefore ||
        a.option.name.localeCompare(b.option.name),
    )
    .map((entry) => entry.option);
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hoursWord(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} ${rounded === 1 ? 'hr' : 'hrs'}`;
}

function sentenceCase(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
