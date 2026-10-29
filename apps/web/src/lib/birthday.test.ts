import { describe, expect, it } from 'vitest';
import { birthdayName, birthdaysByDay, formatBirthday } from './birthday';
import type { BirthdayEntry } from './types';

describe('birthdays', () => {
  it('shows a month and a day, never a year', () => {
    expect(formatBirthday(11, 9)).toBe('Nov 9');
    expect(formatBirthday(2, 29)).toBe('Feb 29');
    expect(formatBirthday(null, 9)).toBeNull();
    expect(formatBirthday(11, undefined)).toBeNull();
  });

  it('names somebody by the name they go by and an initial', () => {
    expect(
      birthdayName({ firstName: 'Angelica', lastName: 'dominguez', preferredName: null }),
    ).toBe('Angelica D');
    expect(
      birthdayName({ firstName: 'Francesca', lastName: 'Front', preferredName: 'Frankie' }),
    ).toBe('Frankie F');
    expect(birthdayName({ firstName: 'Cher', lastName: ' ', preferredName: null })).toBe('Cher');
  });

  it('groups by day', () => {
    const entry = (id: string, date: string): BirthdayEntry => ({
      id,
      date,
      firstName: id,
      lastName: 'X',
      preferredName: null,
      photoUpdatedAt: null,
    });
    const byDay = birthdaysByDay([
      entry('a', '2026-11-09'),
      entry('b', '2026-11-10'),
      entry('c', '2026-11-09'),
    ]);
    expect([...byDay.keys()]).toEqual(['2026-11-09', '2026-11-10']);
    expect(byDay.get('2026-11-09')?.map((e) => e.id)).toEqual(['a', 'c']);
  });
});
