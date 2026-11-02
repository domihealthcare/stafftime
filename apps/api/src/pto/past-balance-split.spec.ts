import { isoDate } from '../common/util/calendar-date.util';
import { splitPastBalance } from './past-balance-split';

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
// Monday 2 to Friday 6 November 2026.
const week = { startDate: day('2026-11-02'), endDate: day('2026-11-06'), isHalfDay: false };
const weekDates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const range = (part: { startDate: Date; endDate: Date } | null) =>
  part && `${isoDate(part.startDate)}..${isoDate(part.endDate)}`;

describe('time off past the balance', () => {
  it('is not split when it fits', () => {
    expect(splitPastBalance(week, weekDates, 5)).toBeNull();
    expect(splitPastBalance(week, weekDates, 7.5)).toBeNull();
  });

  it('keeps the first days still covered and makes the rest unpaid', () => {
    const split = splitPastBalance(week, weekDates, 3)!;
    expect(split.paidDays).toBe(3);
    expect(split.unpaidDays).toBe(2);
    expect(range(split.paid)).toBe('2026-11-02..2026-11-04');
    expect(range(split.unpaid)).toBe('2026-11-05..2026-11-06');
  });

  it('pays whole days only: a half day left stays in the balance', () => {
    const split = splitPastBalance(week, weekDates, 2.5)!;
    expect(split.paidDays).toBe(2);
    expect(split.unpaidDays).toBe(3);
  });

  it('makes all of it unpaid when nothing is left, or less than nothing', () => {
    for (const left of [0, 0.4, -2]) {
      const split = splitPastBalance(week, weekDates, left)!;
      expect(split.paid).toBeNull();
      expect(split.unpaidDays).toBe(5);
      expect(range(split.unpaid)).toBe('2026-11-02..2026-11-06');
    }
  });

  it('keeps a weekend in the middle with the paid part', () => {
    // Thursday 5 to Tuesday 10 November: four days, one left.
    const request = { startDate: day('2026-11-05'), endDate: day('2026-11-10'), isHalfDay: false };
    const dates = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
    const split = splitPastBalance(request, dates, 2)!;
    expect(range(split.paid)).toBe('2026-11-05..2026-11-08');
    expect(range(split.unpaid)).toBe('2026-11-09..2026-11-10');
  });

  it('a half day is paid or unpaid as a whole', () => {
    const half = { startDate: day('2026-11-03'), endDate: day('2026-11-03'), isHalfDay: true };
    expect(splitPastBalance(half, ['2026-11-03'], 0.5)).toBeNull();
    const split = splitPastBalance(half, ['2026-11-03'], 0.3)!;
    expect(split.paid).toBeNull();
    expect(split.unpaidDays).toBe(0.5);
    expect(split.unpaid.isHalfDay).toBe(true);
  });

  it('a request that takes no days is never split', () => {
    const weekend = { startDate: day('2026-11-07'), endDate: day('2026-11-08'), isHalfDay: false };
    expect(splitPastBalance(weekend, [], 0)).toBeNull();
  });
});
