import { BadRequestException } from '@nestjs/common';
import { assertBirthday, birthdaysBetween } from './birthday';

const person = (name: string, birthdayMonth: number | null, birthdayDay: number | null) => ({
  name,
  birthdayMonth,
  birthdayDay,
});

describe('birthdays', () => {
  it('finds whose birthday falls in a week, on the right day', () => {
    const found = birthdaysBetween(
      [person('Tatiyana', 11, 9), person('Arly', 5, 17), person('Nobody', null, null)],
      '2026-11-09',
      '2026-11-15',
    );
    expect(found).toEqual([{ person: expect.objectContaining({ name: 'Tatiyana' }), date: '2026-11-09' }]);
  });

  it('crosses the new year', () => {
    const found = birthdaysBetween(
      [person('Dec', 12, 31), person('Jan', 1, 2)],
      '2026-12-28',
      '2027-01-03',
    );
    expect(found.map((b) => b.date)).toEqual(['2026-12-31', '2027-01-02']);
  });

  it('keeps a 29 February birthday on the 28th when the year has no 29th', () => {
    const leapling = [person('Leap', 2, 29)];
    expect(birthdaysBetween(leapling, '2027-02-22', '2027-03-01').map((b) => b.date)).toEqual([
      '2027-02-28',
    ]);
    expect(birthdaysBetween(leapling, '2028-02-22', '2028-03-01').map((b) => b.date)).toEqual([
      '2028-02-29',
    ]);
  });

  it('wants both the month and the day, or neither', () => {
    expect(() => assertBirthday(11, null)).toThrow(BadRequestException);
    expect(() => assertBirthday(null, 9)).toThrow(BadRequestException);
    expect(() => assertBirthday(null, null)).not.toThrow();
    expect(() => assertBirthday(undefined, undefined)).not.toThrow();
  });

  it('refuses a day the month does not have, but allows the leap day', () => {
    expect(() => assertBirthday(4, 31)).toThrow('There is no day 31 in that month.');
    expect(() => assertBirthday(2, 30)).toThrow(BadRequestException);
    expect(() => assertBirthday(2, 29)).not.toThrow();
  });
});
