import type { BirthdayEntry } from './types';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/// "Nov 9". Birthdays are a month and a day; there is no year to show.
export function formatBirthday(month: number | null | undefined, day: number | null | undefined) {
  if (!month || !day) return null;
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`;
}

/// "Angelica D": the name they go by and their last name's first letter, so
/// two people with the same first name are told apart (Dominguez, September
/// 2026).
export const birthdayName = (
  entry: Pick<BirthdayEntry, 'firstName' | 'lastName' | 'preferredName'>,
) => {
  const initial = entry.lastName.trim().charAt(0).toUpperCase();
  return `${entry.preferredName || entry.firstName}${initial ? ` ${initial}` : ''}`;
};

/// Birthdays grouped by day, YYYY-MM-DD → people.
export function birthdaysByDay(entries: BirthdayEntry[]): Map<string, BirthdayEntry[]> {
  const byDay = new Map<string, BirthdayEntry[]>();
  for (const entry of entries) {
    byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), entry]);
  }
  return byDay;
}
