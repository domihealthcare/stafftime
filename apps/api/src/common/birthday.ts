import { BadRequestException } from '@nestjs/common';

/// Days in each month, with February allowed its 29th: somebody born on a leap
/// day still has a birthday.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * A birthday is a month and a day — never a year (September 2026). Both or
 * neither: half a birthday is a mistake, not a choice.
 */
export function assertBirthday(month?: number | null, day?: number | null): void {
  if (month === undefined && day === undefined) return;
  const hasMonth = month !== null && month !== undefined;
  const hasDay = day !== null && day !== undefined;
  if (hasMonth !== hasDay) {
    throw new BadRequestException('A birthday needs both the month and the day, or neither.');
  }
  if (hasMonth && (day! < 1 || day! > DAYS_IN_MONTH[month! - 1])) {
    throw new BadRequestException(`There is no day ${day} in that month.`);
  }
}

export interface Birthday<T> {
  person: T;
  /// The date it falls on in the range asked about, YYYY-MM-DD.
  date: string;
}

/**
 * Whose birthdays fall between two dates (inclusive, YYYY-MM-DD), and on
 * which date. A 29 February birthday is kept on 28 February in a year without
 * one, rather than silently skipped.
 */
export function birthdaysBetween<T extends { birthdayMonth: number | null; birthdayDay: number | null }>(
  people: T[],
  from: string,
  to: string,
): Birthday<T>[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const found: Birthday<T>[] = [];
  for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
    const month = day.getUTCMonth() + 1;
    const date = day.getUTCDate();
    const year = day.getUTCFullYear();
    const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
    for (const person of people) {
      if (person.birthdayMonth === null || person.birthdayDay === null) continue;
      const onThisDay =
        (person.birthdayMonth === month && person.birthdayDay === date) ||
        (!leap && person.birthdayMonth === 2 && person.birthdayDay === 29 && month === 2 && date === 28);
      if (onThisDay) found.push({ person, date: day.toISOString().slice(0, 10) });
    }
  }
  return found;
}
