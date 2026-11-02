import { isoDate } from '../common/util/calendar-date.util';
import { splitPastBalance, walkApproved } from './past-balance-split';

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

describe('old approved requests walked in date order', () => {
  // Sick days, 5 a year: Mon 2 to Wed 4 November (3), then Mon 9 to Fri 13 (5).
  const first = {
    id: 'first',
    request: { startDate: day('2026-11-02'), endDate: day('2026-11-04'), isHalfDay: false },
    countedDates: ['2026-11-02', '2026-11-03', '2026-11-04'],
    splittable: true,
  };
  const second = {
    id: 'second',
    request: { startDate: day('2026-11-09'), endDate: day('2026-11-13'), isHalfDay: false },
    countedDates: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
    splittable: true,
  };

  it('pays the earliest first and splits the one that runs past what is left', () => {
    const splits = walkApproved([first, second], 5);
    expect(splits.has('first')).toBe(false);
    const split = splits.get('second')!;
    expect(split.paidDays).toBe(2);
    expect(split.unpaidDays).toBe(3);
    expect(range(split.unpaid)).toBe('2026-11-11..2026-11-13');
  });

  it('makes everything after the balance ran out Unpaid as a whole', () => {
    const splits = walkApproved([first, second], 3);
    expect(splits.has('first')).toBe(false);
    expect(splits.get('second')!.paid).toBeNull();
  });

  it('days taken before Domi Staff count first', () => {
    // 5 a year, 4 already taken: 1 left for the first request.
    const splits = walkApproved([first, second], 1);
    expect(splits.get('first')!.paidDays).toBe(1);
    expect(splits.get('second')!.paid).toBeNull();
  });

  it('a request a manager chose (recorded, or changed since) uses its days but is never split', () => {
    const splits = walkApproved([{ ...first, splittable: false }, second], 2);
    // The first took 3 of 2: nothing left for the second.
    expect(splits.has('first')).toBe(false);
    expect(splits.get('second')!.paid).toBeNull();
  });

  it('nothing changes when everything fits', () => {
    expect(walkApproved([first, second], 8).size).toBe(0);
  });
});
