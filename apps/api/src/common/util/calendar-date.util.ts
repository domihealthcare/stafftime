import { BadRequestException } from '@nestjs/common';

/// Helpers for values that are a calendar day rather than an instant — a hire
/// date, the first day of a holiday, a task's due date.
///
/// These are all anchored at UTC midnight. A `@db.Date` column round-trips
/// through the Prisma client as a `Date`, and if that `Date` is built in local
/// time then a machine west of UTC turns "the 3rd" into "the 2nd, 19:00" and
/// loses a day on the way back out. Anchoring at UTC midnight makes the
/// round-trip exact regardless of where the server is.

/// Parses "2026-11-03" as that calendar day, not as a local timestamp.
export function toUtcDate(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`"${value}" is not a valid date.`);
  }
  return date;
}

/// The date part, as "2026-11-03".
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// Inclusive day count: the 3rd to the 3rd is one day, not zero.
export function countDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

/// A new date `days` later. Safe across DST because both ends are UTC midnight.
export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
