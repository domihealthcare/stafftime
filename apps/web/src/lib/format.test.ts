import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  displayName,
  durationHours,
  formatClock,
  formatDuration,
  localDate,
  monthGrid,
  monthOfWeek,
  parseDay,
  startOfMonth,
  startOfWeek,
  toLocalInputValue,
} from './format';

// These helpers work on the browser's own clock. vitest.config.ts runs the
// tests in New Jersey, where the clocks change on 8 March and 1 November 2026.

describe('startOfWeek', () => {
  it('is the Sunday on or before, at midnight', () => {
    const sunday = startOfWeek(new Date(2026, 9, 29, 15, 30)); // Thursday 29 October
    expect(localDate(sunday)).toBe('2026-10-25');
    expect([sunday.getHours(), sunday.getMinutes()]).toEqual([0, 0]);
  });

  it('is the day itself on a Sunday', () => {
    expect(localDate(startOfWeek(new Date(2026, 9, 25, 23, 59)))).toBe('2026-10-25');
  });

  it('lands on midnight in the weeks the clocks change', () => {
    const spring = startOfWeek(new Date(2026, 2, 10, 1)); // Tuesday 10 March
    expect(localDate(spring)).toBe('2026-03-08');
    expect(spring.getHours()).toBe(0);
    const autumn = startOfWeek(new Date(2026, 10, 3, 12)); // Tuesday 3 November
    expect(localDate(autumn)).toBe('2026-11-01');
    expect(autumn.getHours()).toBe(0);
  });

  it('does not change the date it was given', () => {
    const date = new Date(2026, 9, 29, 15);
    startOfWeek(date);
    expect(date.getDate()).toBe(29);
  });
});

describe('addDays', () => {
  it('keeps the wall-clock time across a clock change', () => {
    const saturday = new Date(2026, 2, 7, 0, 0);
    expect(localDate(addDays(saturday, 1))).toBe('2026-03-08');
    expect(addDays(saturday, 2).getHours()).toBe(0);
    expect(localDate(addDays(new Date(2026, 9, 31), 1))).toBe('2026-11-01');
    expect(addDays(new Date(2026, 9, 31, 9), 2).getHours()).toBe(9);
  });

  it('goes back as well', () => {
    expect(localDate(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
  });
});

describe('months', () => {
  it('startOfMonth is the first at midnight', () => {
    const first = startOfMonth(new Date(2026, 9, 29, 15));
    expect(localDate(first)).toBe('2026-10-01');
    expect(first.getHours()).toBe(0);
  });

  it('addMonths never skips February from the 31st', () => {
    expect(localDate(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
    expect(localDate(addMonths(new Date(2026, 0, 1), 1))).toBe('2026-02-01');
    expect(localDate(addMonths(new Date(2026, 0, 1), -1))).toBe('2025-12-01');
    expect(localDate(addMonths(new Date(2026, 10, 1), 2))).toBe('2027-01-01');
  });

  it('monthOfWeek is the month of today when the week holds today', () => {
    // The week of Sunday 27 September to Saturday 3 October 2026.
    const week = new Date(2026, 8, 27);
    expect(localDate(monthOfWeek(week, new Date(2026, 9, 1, 10)))).toBe('2026-10-01');
    expect(localDate(monthOfWeek(week, new Date(2026, 8, 28, 10)))).toBe('2026-09-01');
  });

  it('monthOfWeek is the month of its Wednesday otherwise', () => {
    expect(localDate(monthOfWeek(new Date(2026, 8, 27), new Date(2027, 0, 1)))).toBe('2026-09-01');
    // 29 November to 5 December: Wednesday is 2 December.
    expect(localDate(monthOfWeek(new Date(2026, 10, 29), new Date(2027, 0, 1)))).toBe('2026-12-01');
  });
});

describe('monthGrid', () => {
  const days = (month: Date) => monthGrid(month).map(localDate);

  it('runs Sunday to Saturday around the whole month', () => {
    const grid = days(new Date(2026, 9, 1)); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(35);
    expect(grid[0]).toBe('2026-09-27');
    expect(grid[grid.length - 1]).toBe('2026-10-31');
  });

  it('has six weeks when the month needs them', () => {
    const grid = days(new Date(2026, 7, 1)); // August 2026 starts on a Saturday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-07-26');
    expect(grid[41]).toBe('2026-09-05');
  });

  it('has four weeks for a February that starts on a Sunday', () => {
    // What it does today: the comment above monthGrid says five or six.
    const grid = days(new Date(2026, 1, 1));
    expect(grid).toHaveLength(28);
    expect(grid[0]).toBe('2026-02-01');
    expect(grid[27]).toBe('2026-02-28');
  });

  it('gives every day once, at midnight, through a clock change', () => {
    for (const month of [new Date(2026, 2, 1), new Date(2026, 10, 1)]) {
      const grid = monthGrid(month);
      expect(new Set(grid.map(localDate)).size).toBe(grid.length);
      expect(grid.every((day) => day.getHours() === 0)).toBe(true);
      expect(grid.length % 7).toBe(0);
    }
  });
});

describe('localDate and parseDay', () => {
  it('writes the local date, not the UTC one', () => {
    // 9pm on 1 July in New Jersey is 2 July in UTC.
    expect(localDate(new Date('2026-07-02T01:00:00.000Z'))).toBe('2026-07-01');
  });

  it('reads a day as local midnight', () => {
    const day = parseDay('2026-03-08');
    expect(day && localDate(day)).toBe('2026-03-08');
    expect(day?.getHours()).toBe(0);
  });

  it('turns anything but YYYY-MM-DD into null', () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay('')).toBeNull();
    expect(parseDay('2026-3-8')).toBeNull();
    expect(parseDay('2026-03-08T00:00')).toBeNull();
    expect(parseDay('next week')).toBeNull();
  });

  it('round-trips every day of a year', () => {
    for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026; day = addDays(day, 1)) {
      const text = localDate(day);
      const parsed = parseDay(text);
      expect(parsed && localDate(parsed)).toBe(text);
    }
  });
});

describe('toLocalInputValue', () => {
  it('is the local wall clock with seconds, for datetime-local inputs', () => {
    expect(toLocalInputValue(new Date(2026, 2, 8, 3, 4, 5))).toBe('2026-03-08T03:04:05');
    expect(toLocalInputValue(new Date('2026-07-01T13:00:00.000Z'))).toBe('2026-07-01T09:00:00');
  });
});

describe('formatClock', () => {
  it('reads a stored wall-clock time in twelve-hour form', () => {
    expect(formatClock('08:30')).toBe('8:30 AM');
    expect(formatClock('00:00')).toBe('12:00 AM');
    expect(formatClock('12:15')).toBe('12:15 PM');
    expect(formatClock('23:59')).toBe('11:59 PM');
    expect(formatClock('13:05')).toBe('1:05 PM');
  });
});

describe('durations', () => {
  it('formatDuration gives hours and minutes', () => {
    expect(formatDuration('2026-10-01T13:00:00.000Z', '2026-10-01T20:32:00.000Z')).toBe('7h 32m');
    expect(formatDuration('2026-10-01T13:00:00.000Z', '2026-10-01T13:45:59.000Z')).toBe('45m');
    expect(formatDuration('2026-10-01T13:00:00.000Z', '2026-10-01T14:00:00.000Z')).toBe('1h 0m');
  });

  it('formatDuration never goes below nothing', () => {
    expect(formatDuration('2026-10-01T14:00:00.000Z', '2026-10-01T13:00:00.000Z')).toBe('0m');
  });

  it('counts real hours across the autumn change, not wall-clock ones', () => {
    // Midnight to 6am on 1 November is seven hours long.
    expect(formatDuration('2026-11-01T04:00:00.000Z', '2026-11-01T11:00:00.000Z')).toBe('7h 0m');
    expect(durationHours('2026-11-01T04:00:00.000Z', '2026-11-01T11:00:00.000Z')).toBe(7);
  });

  it('durationHours is decimal, and nothing while still clocked in', () => {
    expect(durationHours('2026-10-01T13:00:00.000Z', '2026-10-01T20:30:00.000Z')).toBe(7.5);
    expect(durationHours('2026-10-01T13:00:00.000Z', null)).toBe(0);
    expect(durationHours('2026-10-01T14:00:00.000Z', '2026-10-01T13:00:00.000Z')).toBe(0);
  });
});

describe('displayName', () => {
  it('is the name they go by, then their surname', () => {
    expect(displayName({ firstName: 'Angelica', lastName: 'Dominguez', preferredName: null })).toBe(
      'Angelica Dominguez',
    );
    expect(
      displayName({ firstName: 'Francesca', lastName: 'Front', preferredName: 'Frankie' }),
    ).toBe('Frankie Front');
  });
});
