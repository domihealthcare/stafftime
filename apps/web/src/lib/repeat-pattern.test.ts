import { describe, expect, it } from 'vitest';
import * as server from '../../../api/src/shifts/repeat-pattern';
import {
  EVERY_WEEK,
  describeRepeat,
  firstDates,
  isEveryWeek,
  onPattern,
  weekOfMonth,
  type RepeatWeeks,
} from './repeat-pattern';

// Days are numbered as the API numbers them: 1 = Monday ... 7 = Sunday.
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;
const SUN = 7;

const weekly = (everyWeeks = 1): RepeatWeeks => ({ everyWeeks, weeksOfMonth: [] });
const byMonth = (...weeksOfMonth: number[]): RepeatWeeks => ({ everyWeeks: 1, weeksOfMonth });

describe('weekOfMonth', () => {
  it('is 1 to 4 by the day of the month, and -1 for a fifth', () => {
    expect(weekOfMonth('2026-10-01')).toBe(1);
    expect(weekOfMonth('2026-10-07')).toBe(1);
    expect(weekOfMonth('2026-10-08')).toBe(2);
    expect(weekOfMonth('2026-10-28')).toBe(4);
    expect(weekOfMonth('2026-10-29')).toBe(-1);
    expect(weekOfMonth('2026-10-31')).toBe(-1);
  });
});

describe('isEveryWeek', () => {
  it('is only every week with no weeks of the month', () => {
    expect(isEveryWeek(EVERY_WEEK)).toBe(true);
    expect(isEveryWeek(weekly(2))).toBe(false);
    expect(isEveryWeek(byMonth(1))).toBe(false);
  });
});

describe('onPattern', () => {
  it('is never on a day not chosen', () => {
    expect(onPattern('2026-10-06', [MON], EVERY_WEEK, '2026-10-05')).toBe(false); // a Tuesday
    expect(onPattern('2026-10-05', [MON], EVERY_WEEK, '2026-10-05')).toBe(true);
  });

  it('every week is every chosen day, before the cycle start too', () => {
    expect(onPattern('2025-01-06', [MON], EVERY_WEEK, '2026-10-05')).toBe(true);
  });

  it('counts every other week Sunday first, from the week of cycleFrom', () => {
    // cycleFrom is Monday 5 October, so the week of Sunday 4 October is on.
    const days = [SUN, MON];
    const on = (date: string) => onPattern(date, days, weekly(2), '2026-10-05');
    expect(on('2026-10-04')).toBe(true); // Sunday, same week
    expect(on('2026-10-05')).toBe(true);
    expect(on('2026-10-11')).toBe(false); // the next Sunday starts the off week
    expect(on('2026-10-12')).toBe(false);
    expect(on('2026-10-18')).toBe(true);
    expect(on('2026-10-19')).toBe(true);
  });

  it('counts back as well as forward', () => {
    const on = (date: string) => onPattern(date, [MON], weekly(3), '2026-10-05');
    expect(on('2026-09-14')).toBe(true);
    expect(on('2026-09-21')).toBe(false);
    expect(on('2026-09-28')).toBe(false);
    expect(on('2026-10-26')).toBe(true);
  });

  it('keeps counting whole weeks across the clock change', () => {
    const on = (date: string) => onPattern(date, [MON], weekly(2), '2026-10-26');
    expect(on('2026-11-09')).toBe(true);
    expect(on('2026-03-02')).toBe(true);
    expect(on('2026-03-09')).toBe(false);
  });

  it('takes the first to fourth by the date, and the last as the one with no week after it', () => {
    // Saturdays in October 2026: 3, 10, 17, 24, 31.
    expect(onPattern('2026-10-03', [SAT], byMonth(1), '2026-10-01')).toBe(true);
    expect(onPattern('2026-10-10', [SAT], byMonth(1), '2026-10-01')).toBe(false);
    expect(onPattern('2026-10-24', [SAT], byMonth(4), '2026-10-01')).toBe(true);
    expect(onPattern('2026-10-31', [SAT], byMonth(4), '2026-10-01')).toBe(false);
    expect(onPattern('2026-10-31', [SAT], byMonth(-1), '2026-10-01')).toBe(true);
    expect(onPattern('2026-10-24', [SAT], byMonth(-1), '2026-10-01')).toBe(false);
  });

  it('treats a fourth that is also the last as both', () => {
    // February 2026 has four Saturdays; the 28th is the fourth and the last.
    expect(onPattern('2026-02-28', [SAT], byMonth(4), '2026-02-01')).toBe(true);
    expect(onPattern('2026-02-28', [SAT], byMonth(-1), '2026-02-01')).toBe(true);
  });

  it('takes several weeks of the month at once', () => {
    const on = (date: string) => onPattern(date, [FRI], byMonth(2, 4), '2026-10-01');
    // Fridays in October 2026: 2, 9, 16, 23, 30.
    expect(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'].map(on)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});

describe('firstDates', () => {
  it('lists the first few dates on or after the start', () => {
    expect(firstDates('2026-10-01', [SAT], byMonth(1), 3)).toEqual([
      '2026-10-03',
      '2026-11-07',
      '2026-12-05',
    ]);
    expect(firstDates('2026-10-05', [MON, THU], EVERY_WEEK, 4)).toEqual([
      '2026-10-05',
      '2026-10-08',
      '2026-10-12',
      '2026-10-15',
    ]);
  });

  it('counts every few weeks from the start unless told otherwise', () => {
    expect(firstDates('2026-10-05', [MON], weekly(2), 3)).toEqual([
      '2026-10-05',
      '2026-10-19',
      '2026-11-02',
    ]);
    expect(firstDates('2026-10-05', [MON], weekly(2), 2, undefined, '2026-10-12')).toEqual([
      '2026-10-12',
      '2026-10-26',
    ]);
  });

  it('stops at the end date', () => {
    expect(firstDates('2026-10-05', [MON], EVERY_WEEK, 5, '2026-10-19')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
  });

  it('finds nothing with no days or no start', () => {
    expect(firstDates('2026-10-05', [], EVERY_WEEK, 3)).toEqual([]);
    expect(firstDates('', [MON], EVERY_WEEK, 3)).toEqual([]);
    expect(firstDates('5 October', [MON], EVERY_WEEK, 3)).toEqual([]);
  });
});

describe('describeRepeat', () => {
  it('names the days, Sunday first', () => {
    expect(describeRepeat([MON, THU], EVERY_WEEK)).toBe('Mondays and Thursdays');
    expect(describeRepeat([MON, SUN], EVERY_WEEK)).toBe('Sundays and Mondays');
    expect(describeRepeat([MON, WED, FRI], EVERY_WEEK)).toBe('Mondays, Wednesdays and Fridays');
    expect(describeRepeat([MON, TUE, WED, THU, FRI, SAT, SUN], EVERY_WEEK)).toBe('Every day');
  });

  it('says every other, third or fourth', () => {
    expect(describeRepeat([SAT], weekly(2))).toBe('Every other Saturday');
    expect(describeRepeat([TUE, FRI], weekly(3))).toBe('Every third Tuesday and Friday');
    expect(describeRepeat([SAT], weekly(4))).toBe('Every fourth Saturday');
  });

  it('says which weeks of the month, in order', () => {
    expect(describeRepeat([SAT], byMonth(1))).toBe('The first Saturday of the month');
    expect(describeRepeat([SAT], byMonth(-1, 1))).toBe('The first and last Saturday of the month');
    expect(describeRepeat([FRI], byMonth(2, 4))).toBe('The second and fourth Friday of the month');
  });

  it('starts small mid-sentence', () => {
    expect(describeRepeat([SAT], byMonth(1), false)).toBe('the first Saturday of the month');
    expect(describeRepeat([SAT], weekly(2), false)).toBe('every other Saturday');
    expect(describeRepeat([MON, TUE, WED, THU, FRI, SAT, SUN], EVERY_WEEK, false)).toBe(
      'every day',
    );
    expect(describeRepeat([MON], EVERY_WEEK, false)).toBe('Mondays');
  });
});

// The forms show the first few dates before saving; the server writes the
// shifts. If the two ever disagree, the dates promised are not the dates made.
describe("the same rules as the server's shifts/repeat-pattern.ts", () => {
  const patterns: { days: number[]; weeks: RepeatWeeks; cycleFrom: string }[] = [];
  const daySets = [
    [MON],
    [SAT],
    [SUN],
    [SUN, MON],
    [TUE, FRI],
    [MON, TUE, WED, THU, FRI, SAT, SUN],
  ];
  for (const days of daySets) {
    for (const everyWeeks of [1, 2, 3, 4]) {
      for (const cycleFrom of ['2026-01-04', '2026-03-10', '2026-10-31', '2027-02-14']) {
        patterns.push({ days, weeks: weekly(everyWeeks), cycleFrom });
      }
    }
    for (const weeksOfMonth of [
      [1],
      [2],
      [3],
      [4],
      [-1],
      [1, 3],
      [2, 4],
      [4, -1],
      [1, 2, 3, 4, -1],
    ]) {
      patterns.push({ days, weeks: byMonth(...weeksOfMonth), cycleFrom: '2026-01-01' });
    }
  }

  const dates: string[] = [];
  for (let day = Date.UTC(2026, 0, 1); day <= Date.UTC(2027, 11, 31); day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }

  const serverPattern = (p: (typeof patterns)[number]): server.RepeatPattern => ({
    daysOfWeek: p.days,
    everyWeeks: p.weeks.everyWeeks,
    weeksOfMonth: p.weeks.weeksOfMonth,
    cycleFrom: p.cycleFrom,
  });

  it('puts a shift on exactly the same dates, for two years of every kind of pattern', () => {
    let compared = 0;
    for (const pattern of patterns) {
      const ours = dates.filter((date) =>
        onPattern(date, pattern.days, pattern.weeks, pattern.cycleFrom),
      );
      const theirs = dates.filter((date) => server.onPattern(date, serverPattern(pattern)));
      expect(ours, JSON.stringify(pattern)).toEqual(theirs);
      compared += 1;
    }
    expect(compared).toBe(patterns.length);
  });

  it('describes it in the same words mid-sentence (bar "every day", the forms\' own)', () => {
    for (const pattern of patterns) {
      if (isEveryWeek(pattern.weeks) && pattern.days.length === 7) continue;
      expect(describeRepeat(pattern.days, pattern.weeks, false), JSON.stringify(pattern)).toBe(
        server.patternPhrase(serverPattern(pattern)),
      );
    }
  });
});
