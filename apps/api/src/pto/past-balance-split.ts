import { addUtcDays, toUtcDate } from '../common/util/calendar-date.util';

/**
 * Time off past the balance, split when it is approved (2 November 2026,
 * Dominguez: "People are requesting days and it says Approved but does not
 * say UNPAID"). The days still covered by the allowance stay as they were
 * asked for (Sick or PTO); the rest become Unpaid, so what the Time off
 * screen says is what payroll pays. Pure.
 *
 * Only whole days are paid: with 2.5 sick days left, 5 asked for is 2 Sick
 * and 3 Unpaid, and the half day stays in the balance. A half day asked for
 * with less than half a day left is Unpaid as a whole.
 *
 * Each policy year is judged on its own (12 November 2026, Dominguez: "check
 * each year separately"): a request from late December into January takes its
 * December days from that year's balance and its January days from the next
 * year's, so it can come out paid, unpaid, then paid again. A request inside
 * one year is one part, as before.
 */

/// One stretch of a split request, in date order.
export interface SplitSegment {
  startDate: Date;
  endDate: Date;
  isHalfDay: boolean;
  /// Paid from the allowance (stays as asked), or Unpaid.
  paid: boolean;
  /// The days it takes (weekdays the office is open).
  days: number;
}

export interface PastBalanceSplit {
  /// Days still paid from the allowance, and days unpaid.
  paidDays: number;
  unpaidDays: number;
  /// The stretches, in date order, with neighbours of the same kind joined.
  /// The first starts on the request's first day and the last ends on its
  /// last; each runs to the day before the next, so a weekend in between
  /// stays with the stretch before it.
  segments: SplitSegment[];
}

/// The request's days that fall in one policy year, and what that year's
/// allowance had left before it.
export interface YearPart {
  /// In date order ("YYYY-MM-DD").
  countedDates: string[];
  left: number;
}

/// A small allowance for rounding: balances are kept to one decimal.
const ROUNDING = 1e-9;

/**
 * The split of a request whose days fall in one or more policy years, each
 * paid from its own year's balance, or null when every year covers its days.
 */
export function splitByYear(
  request: { startDate: Date; endDate: Date; isHalfDay: boolean },
  parts: YearPart[],
): PastBalanceSplit | null {
  const allDates = parts.flatMap((part) => part.countedDates);
  if (allDates.length === 0) return null;
  const halfDay = request.isHalfDay && allDates.length === 1;

  // Each counted day, paid or not, year by year.
  const flags: { date: string; paid: boolean }[] = [];
  for (const part of parts) {
    const days = halfDay ? 0.5 : part.countedDates.length;
    if (days === 0) continue;
    if (days <= part.left + ROUNDING) {
      for (const date of part.countedDates) flags.push({ date, paid: true });
      continue;
    }
    const paidWhole = halfDay ? 0 : Math.max(0, Math.floor(part.left + ROUNDING));
    part.countedDates.forEach((date, index) => flags.push({ date, paid: index < paidWhole }));
  }
  if (flags.every((flag) => flag.paid)) return null;

  // Runs of the same kind, joined across the turn of the year.
  const runs: { first: string; paid: boolean; count: number }[] = [];
  for (const flag of flags) {
    const last = runs[runs.length - 1];
    if (last && last.paid === flag.paid) last.count += 1;
    else runs.push({ first: flag.date, paid: flag.paid, count: 1 });
  }
  const segments: SplitSegment[] = runs.map((run, index) => {
    const startDate = index === 0 ? request.startDate : toUtcDate(run.first);
    const endDate =
      index === runs.length - 1
        ? request.endDate
        : addUtcDays(toUtcDate(runs[index + 1].first), -1);
    return {
      startDate,
      endDate,
      isHalfDay: halfDay && request.isHalfDay,
      paid: run.paid,
      days: halfDay ? 0.5 : run.count,
    };
  });
  const sum = (paid: boolean) =>
    segments.filter((segment) => segment.paid === paid).reduce((s, x) => s + x.days, 0);
  return { paidDays: sum(true), unpaidDays: sum(false), segments };
}

/// One policy year's split, as before the turn of the year was considered.
export function splitPastBalance(
  request: { startDate: Date; endDate: Date; isHalfDay: boolean },
  /// The days of the request that count, in order ("YYYY-MM-DD").
  countedDates: string[],
  /// What is left of the allowance, before this request.
  left: number,
): PastBalanceSplit | null {
  return splitByYear(request, [{ countedDates, left }]);
}

/**
 * Requests approved before the split existed (2 November 2026, Dominguez:
 * "fix the old approved requests that went past the balance"): one person's
 * approved requests drawing on one balance in one policy year, walked in
 * date order the way the balance counts them, each paid from what is left
 * until it runs out. Returns the split for each request that went past it,
 * judged on its days in this year alone.
 *
 * A request that may not be split (recorded by an admin, or changed by a
 * manager since) still uses up its days, so the ones after it are judged on
 * what really was left. `leftBefore`, when given, is filled with what each
 * splittable request found left, so a request running into another policy
 * year can be judged on each year's walk together (`splitByYear`).
 */
export interface ApprovedToWalk {
  id: string;
  request: { startDate: Date; endDate: Date; isHalfDay: boolean };
  /// Its days inside the policy year, in order.
  countedDates: string[];
  splittable: boolean;
}

export function walkApproved(
  requests: ApprovedToWalk[],
  /// What the year had to give before anything booked in Domi Staff.
  startingLeft: number,
  leftBefore?: Map<string, number>,
): Map<string, PastBalanceSplit> {
  const splits = new Map<string, PastBalanceSplit>();
  let left = startingLeft;
  for (const item of requests) {
    const halfDay = item.request.isHalfDay && item.countedDates.length === 1;
    const days = halfDay ? 0.5 : item.countedDates.length;
    if (!item.splittable) {
      left -= days;
      continue;
    }
    leftBefore?.set(item.id, left);
    const split = splitPastBalance(item.request, item.countedDates, left);
    if (split) {
      splits.set(item.id, split);
      left -= split.paidDays;
    } else {
      left -= days;
    }
  }
  return splits;
}
