import { PayRateUnit, PayType } from '@prisma/client';
import { addDaysTo, datesBetween, weekStartOf } from '../common/util/zoned-time.util';

/**
 * What the rota on screen costs (October 2026, Dominguez — from the survey of
 * similar apps: "rota cost should be for only certain individuals", hourly
 * and salaried staff both). Shown on the Schedule to the people an admin has
 * chosen (`Employee.canSeeRotaCost`), never anybody else, and only as totals
 * — by office and by day, never by person, so nobody's pay can be read off it.
 *
 * - **Hourly pay** (`PayRateUnit.HOURLY`): the rate in force on the shift's
 *   day × its scheduled hours. Hours past the overtime line in an overtime
 *   week (the pay period's weeks, as everywhere) are at **1.5×** for hourly
 *   staff (`PayType.HOURLY`); salaried staff with an hourly rate are exempt.
 * - **Salaried pay** (`PayRateUnit.YEARLY`): a year ÷ 52 a week, so ÷ 364 a
 *   day, for every day on screen they are employed — on the rota or not,
 *   because a salary is paid either way. Put under the offices of their
 *   shifts on screen, by hours, or their main office with none.
 *
 * Scheduled hours, drafts included — what the rota as built would cost, not
 * what was worked, and not taxes or benefits. People on the rota with no pay
 * on file are named, so a total is never quietly short.
 *
 * Pure: `RotaCostService` reads shifts and pay and passes them here.
 */

export const OVERTIME_MULTIPLIER = 1.5;

export interface CostShift {
  employeeId: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  /// Its day in New Jersey, "YYYY-MM-DD".
  date: string;
}

export interface CostPerson {
  id: string;
  name: string;
  payType: PayType;
  /// Main office, for a salary with no shifts on screen.
  mainLocationId: string | null;
  /// Pay over time, earliest first: the rate from that day on.
  rates: { from: string; rate: number; unit: PayRateUnit }[];
  /// Their employment, so a salary counts only the days they worked here.
  hiredOn: string | null;
  leftOn: string | null;
}

export interface RotaCost {
  from: string;
  to: string;
  total: number;
  /// Hourly pay for scheduled hours, overtime included.
  hourly: number;
  /// Of which the overtime extra (the half on top).
  overtimeExtra: number;
  overtimeHours: number;
  /// Salaries for the days on screen.
  salaried: number;
  scheduledHours: number;
  byLocation: { locationId: string | null; total: number; hours: number }[];
  byDay: { date: string; total: number }[];
  /// On the rota on screen with no pay on file for that day.
  missingPay: { id: string; name: string }[];
}

export function rotaCost(input: {
  from: string;
  to: string;
  /// Every shift in the overtime weeks touching the range, so a week that
  /// starts before the range still counts its earlier hours.
  shifts: CostShift[];
  people: CostPerson[];
  thresholdHours: number;
  /// 1 = Monday … 7 = Sunday.
  workweekStartsOn: number;
}): RotaCost {
  const { from, to, thresholdHours, workweekStartsOn } = input;
  const days = datesBetween(from, to);
  const people = new Map(input.people.map((person) => [person.id, person]));
  const inRange = (date: string) => date >= from && date <= to;

  const byLocation = new Map<string | null, { total: number; hours: number }>();
  const byDay = new Map<string, number>(days.map((date) => [date, 0]));
  const missing = new Map<string, string>();
  let hourly = 0;
  let overtimeExtra = 0;
  let overtimeHours = 0;
  let salaried = 0;
  let scheduledHours = 0;

  const addTo = (locationId: string | null, date: string, money: number, hours: number) => {
    const office = byLocation.get(locationId) ?? { total: 0, hours: 0 };
    office.total += money;
    office.hours += hours;
    byLocation.set(locationId, office);
    byDay.set(date, (byDay.get(date) ?? 0) + money);
  };

  // Hourly pay, an overtime week at a time, in the order the hours come.
  const weeks = new Map<string, CostShift[]>();
  for (const shift of input.shifts) {
    const key = `${shift.employeeId}|${weekStartOf(shift.date, workweekStartsOn)}`;
    weeks.set(key, [...(weeks.get(key) ?? []), shift]);
  }
  for (const shifts of weeks.values()) {
    shifts.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    let worked = 0;
    for (const shift of shifts) {
      const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
      const person = people.get(shift.employeeId);
      const pay = person ? rateOn(person, shift.date) : null;
      const counted = inRange(shift.date);
      if (counted) scheduledHours += hours;
      if (!person || !pay) {
        if (counted && person) missing.set(person.id, person.name);
        worked += hours;
        continue;
      }
      if (pay.unit !== PayRateUnit.HOURLY) {
        // A salary is counted by the day below; here only the hours, by office.
        if (counted) addTo(shift.locationId, shift.date, 0, hours);
        worked += hours;
        continue;
      }
      const exempt = person.payType !== PayType.HOURLY;
      const regular = exempt ? hours : Math.min(hours, Math.max(0, thresholdHours - worked));
      const over = hours - regular;
      worked += hours;
      if (!counted) continue;
      const money = regular * pay.rate + over * pay.rate * OVERTIME_MULTIPLIER;
      hourly += money;
      overtimeHours += over;
      overtimeExtra += over * pay.rate * (OVERTIME_MULTIPLIER - 1);
      addTo(shift.locationId, shift.date, money, hours);
    }
  }

  // Salaries: a day's worth for each day employed, split by where they work.
  for (const person of input.people) {
    const theirs = input.shifts.filter((s) => s.employeeId === person.id && inRange(s.date));
    const hoursAt = new Map<string, number>();
    for (const shift of theirs) {
      const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
      hoursAt.set(shift.locationId, (hoursAt.get(shift.locationId) ?? 0) + hours);
    }
    const totalHours = [...hoursAt.values()].reduce((sum, hours) => sum + hours, 0);
    for (const date of days) {
      if (person.hiredOn && date < person.hiredOn) continue;
      if (person.leftOn && date > person.leftOn) continue;
      const pay = rateOn(person, date);
      if (!pay || pay.unit !== PayRateUnit.YEARLY) continue;
      const daily = pay.rate / 364;
      salaried += daily;
      if (totalHours > 0) {
        for (const [locationId, hours] of hoursAt) {
          addTo(locationId, date, (daily * hours) / totalHours, 0);
        }
      } else {
        addTo(person.mainLocationId, date, daily, 0);
      }
    }
  }

  const cents = (value: number) => Math.round(value * 100) / 100;
  return {
    from,
    to,
    total: cents(hourly + salaried),
    hourly: cents(hourly),
    overtimeExtra: cents(overtimeExtra),
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    salaried: cents(salaried),
    scheduledHours: Math.round(scheduledHours * 100) / 100,
    byLocation: [...byLocation.entries()]
      .map(([locationId, value]) => ({
        locationId,
        total: cents(value.total),
        hours: Math.round(value.hours * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total),
    byDay: days.map((date) => ({ date, total: cents(byDay.get(date) ?? 0) })),
    missingPay: [...missing.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/// The pay in force on a day: the latest change on or before it.
export function rateOn(person: CostPerson, date: string) {
  let found: CostPerson['rates'][number] | null = null;
  for (const rate of person.rates) {
    if (rate.from <= date) found = rate;
  }
  return found;
}

/// The overtime weeks that touch a range, as one span of days.
export function overtimeSpan(from: string, to: string, workweekStartsOn: number) {
  return {
    from: weekStartOf(from, workweekStartsOn),
    to: addDaysTo(weekStartOf(to, workweekStartsOn), 6),
  };
}
