import { isoDate } from '../common/util/calendar-date.util';
import {
  PastBalanceSplit,
  splitByYear,
  splitPastBalance,
  walkApproved,
} from './past-balance-split';

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
// Monday 2 to Friday 6 November 2026.
const week = { startDate: day('2026-11-02'), endDate: day('2026-11-06'), isHalfDay: false };
const weekDates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const range = (part: { startDate: Date; endDate: Date } | null | undefined) =>
  part ? `${isoDate(part.startDate)}..${isoDate(part.endDate)}` : null;
/// The paid stretch and the unpaid one, for a split inside one year.
const paidOf = (split: PastBalanceSplit) => split.segments.find((s) => s.paid) ?? null;
const unpaidOf = (split: PastBalanceSplit) => split.segments.find((s) => !s.paid)!;
/// "P 2026-12-28..2026-12-29 | U ..." for every stretch.
const shape = (split: PastBalanceSplit | null) =>
  split && split.segments.map((s) => `${s.paid ? 'P' : 'U'} ${range(s)} (${s.days})`).join(' | ');

describe('time off past the balance', () => {
  it('is not split when it fits', () => {
    expect(splitPastBalance(week, weekDates, 5)).toBeNull();
    expect(splitPastBalance(week, weekDates, 7.5)).toBeNull();
  });

  it('keeps the first days still covered and makes the rest unpaid', () => {
    const split = splitPastBalance(week, weekDates, 3)!;
    expect(split.paidDays).toBe(3);
    expect(split.unpaidDays).toBe(2);
    expect(range(paidOf(split))).toBe('2026-11-02..2026-11-04');
    expect(range(unpaidOf(split))).toBe('2026-11-05..2026-11-06');
  });

  it('pays whole days only: a half day left stays in the balance', () => {
    const split = splitPastBalance(week, weekDates, 2.5)!;
    expect(split.paidDays).toBe(2);
    expect(split.unpaidDays).toBe(3);
  });

  it('makes all of it unpaid when nothing is left, or less than nothing', () => {
    for (const left of [0, 0.4, -2]) {
      const split = splitPastBalance(week, weekDates, left)!;
      expect(paidOf(split)).toBeNull();
      expect(split.unpaidDays).toBe(5);
      expect(range(unpaidOf(split))).toBe('2026-11-02..2026-11-06');
    }
  });

  it('keeps a weekend in the middle with the paid part', () => {
    // Thursday 5 to Tuesday 10 November: four days, one left.
    const request = { startDate: day('2026-11-05'), endDate: day('2026-11-10'), isHalfDay: false };
    const dates = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
    const split = splitPastBalance(request, dates, 2)!;
    expect(range(paidOf(split))).toBe('2026-11-05..2026-11-08');
    expect(range(unpaidOf(split))).toBe('2026-11-09..2026-11-10');
  });

  it('a half day is paid or unpaid as a whole', () => {
    const half = { startDate: day('2026-11-03'), endDate: day('2026-11-03'), isHalfDay: true };
    expect(splitPastBalance(half, ['2026-11-03'], 0.5)).toBeNull();
    const split = splitPastBalance(half, ['2026-11-03'], 0.3)!;
    expect(paidOf(split)).toBeNull();
    expect(split.unpaidDays).toBe(0.5);
    expect(unpaidOf(split).isHalfDay).toBe(true);
  });

  it('a split inside one year is two stretches, paid then unpaid', () => {
    expect(shape(splitPastBalance(week, weekDates, 3))).toBe(
      'P 2026-11-02..2026-11-04 (3) | U 2026-11-05..2026-11-06 (2)',
    );
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
    expect(range(unpaidOf(split))).toBe('2026-11-11..2026-11-13');
  });

  it('makes everything after the balance ran out Unpaid as a whole', () => {
    const splits = walkApproved([first, second], 3);
    expect(splits.has('first')).toBe(false);
    expect(paidOf(splits.get('second')!)).toBeNull();
  });

  it('days taken before Domi Staff count first', () => {
    // 5 a year, 4 already taken: 1 left for the first request.
    const splits = walkApproved([first, second], 1);
    expect(splits.get('first')!.paidDays).toBe(1);
    expect(paidOf(splits.get('second')!)).toBeNull();
  });

  it('a request a manager chose (recorded, or changed since) uses its days but is never split', () => {
    const splits = walkApproved([{ ...first, splittable: false }, second], 2);
    // The first took 3 of 2: nothing left for the second.
    expect(splits.has('first')).toBe(false);
    expect(paidOf(splits.get('second')!)).toBeNull();
  });

  it('nothing changes when everything fits', () => {
    expect(walkApproved([first, second], 8).size).toBe(0);
  });
});

describe('a request across the turn of the year (each year on its own)', () => {
  // Mon 28 December 2026 to Tue 5 January 2027: four days in December, three
  // in January (Fri 1, Mon 4, Tue 5).
  const request = { startDate: day('2026-12-28'), endDate: day('2027-01-05'), isHalfDay: false };
  const december = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'];
  const january = ['2027-01-01', '2027-01-04', '2027-01-05'];

  it('is not split when each year covers its own days', () => {
    expect(
      splitByYear(request, [
        { countedDates: december, left: 4 },
        { countedDates: january, left: 3 },
      ]),
    ).toBeNull();
  });

  it('is not let off by the next year: December past its balance is unpaid there', () => {
    // 2 left in 2026, a whole new year in 2027.
    const split = splitByYear(request, [
      { countedDates: december, left: 2 },
      { countedDates: january, left: 5 },
    ]);
    expect(shape(split)).toBe(
      'P 2026-12-28..2026-12-29 (2) | U 2026-12-30..2026-12-31 (2) | P 2027-01-01..2027-01-05 (3)',
    );
    expect(split!.paidDays).toBe(5);
    expect(split!.unpaidDays).toBe(2);
  });

  it('joins the paid days across the year when only January runs short', () => {
    const split = splitByYear(request, [
      { countedDates: december, left: 5 },
      { countedDates: january, left: 1 },
    ]);
    // The paid stretch runs on into 1 January, and the weekend after it stays
    // with it, as a weekend always stays with the stretch before it.
    expect(shape(split)).toBe('P 2026-12-28..2027-01-03 (5) | U 2027-01-04..2027-01-05 (2)');
  });

  it('is unpaid as a whole when neither year has anything left', () => {
    const split = splitByYear(request, [
      { countedDates: december, left: 0 },
      { countedDates: january, left: -1 },
    ]);
    expect(shape(split)).toBe('U 2026-12-28..2027-01-05 (7)');
  });

  it('can be unpaid, then paid, then unpaid', () => {
    const split = splitByYear(request, [
      { countedDates: december, left: 0 },
      { countedDates: january, left: 2 },
    ]);
    expect(shape(split)).toBe(
      'U 2026-12-28..2026-12-31 (4) | P 2027-01-01..2027-01-04 (2) | U 2027-01-05..2027-01-05 (1)',
    );
  });

  it('walking a year records what each request found left', () => {
    const leftBefore = new Map<string, number>();
    walkApproved(
      [
        { id: 'a', request, countedDates: december, splittable: true },
        {
          id: 'b',
          request: { startDate: day('2026-12-31'), endDate: day('2026-12-31'), isHalfDay: false },
          countedDates: ['2026-12-31'],
          splittable: true,
        },
      ],
      5,
      leftBefore,
    );
    expect(leftBefore.get('a')).toBe(5);
    expect(leftBefore.get('b')).toBe(1);
  });
});
