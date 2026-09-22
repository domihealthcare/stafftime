import {
  addDaysTo,
  datesBetween,
  isoWeekdayOf,
  localDateIn,
  offsetMinutesAt,
  zonedTimeToUtc,
} from './zoned-time.util';

const NJ = 'America/New_York';

describe('offsetMinutesAt', () => {
  it('is -300 in New Jersey in winter', () => {
    expect(offsetMinutesAt(new Date('2026-01-15T12:00:00Z'), NJ)).toBe(-300);
  });

  it('is -240 in New Jersey in summer', () => {
    expect(offsetMinutesAt(new Date('2026-07-15T12:00:00Z'), NJ)).toBe(-240);
  });

  it('is zero in UTC', () => {
    expect(offsetMinutesAt(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('zonedTimeToUtc', () => {
  it('reads 9am winter as 14:00 UTC', () => {
    expect(zonedTimeToUtc('2026-01-13', '09:00', NJ).toISOString()).toBe(
      '2026-01-13T14:00:00.000Z',
    );
  });

  it('reads 9am summer as 13:00 UTC', () => {
    expect(zonedTimeToUtc('2026-07-14', '09:00', NJ).toISOString()).toBe(
      '2026-07-14T13:00:00.000Z',
    );
  });

  /**
   * The whole reason this helper exists. A shift repeating at 9am across the
   * November clock change must stay at 9am locally, which means a different UTC
   * instant on either side.
   */
  it('keeps a wall-clock time fixed across the autumn clock change', () => {
    // US clocks go back on Sunday 1 November 2026.
    const before = zonedTimeToUtc('2026-10-30', '09:00', NJ);
    const after = zonedTimeToUtc('2026-11-06', '09:00', NJ);

    expect(before.toISOString()).toBe('2026-10-30T13:00:00.000Z');
    expect(after.toISOString()).toBe('2026-11-06T14:00:00.000Z');
    // Same wall clock, an hour apart in UTC.
    expect(after.getTime() - before.getTime()).toBe(7 * 86_400_000 + 3_600_000);
  });

  it('keeps a wall-clock time fixed across the spring clock change', () => {
    // US clocks go forward on Sunday 8 March 2026.
    expect(zonedTimeToUtc('2026-03-06', '09:00', NJ).toISOString()).toBe(
      '2026-03-06T14:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-03-13', '09:00', NJ).toISOString()).toBe(
      '2026-03-13T13:00:00.000Z',
    );
  });

  it('handles a time on the clock-change day itself', () => {
    // 1 November 2026: clocks go back at 2am, so 9am is already standard time.
    expect(zonedTimeToUtc('2026-11-01', '09:00', NJ).toISOString()).toBe(
      '2026-11-01T14:00:00.000Z',
    );
    // 8 March 2026: clocks went forward at 2am, so 9am is daylight time.
    expect(zonedTimeToUtc('2026-03-08', '09:00', NJ).toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );
  });

  it('handles a time just before a spring-forward transition', () => {
    // 01:30 on 8 March exists; 02:30 does not.
    expect(zonedTimeToUtc('2026-03-08', '01:30', NJ).toISOString()).toBe(
      '2026-03-08T06:30:00.000Z',
    );
  });

  it('handles midnight and end of day', () => {
    expect(zonedTimeToUtc('2026-07-14', '00:00', NJ).toISOString()).toBe(
      '2026-07-14T04:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-14', '23:59', NJ).toISOString()).toBe(
      '2026-07-15T03:59:00.000Z',
    );
  });

  it('accepts seconds', () => {
    expect(zonedTimeToUtc('2026-07-14', '09:30:15', NJ).toISOString()).toBe(
      '2026-07-14T13:30:15.000Z',
    );
  });

  it('round-trips through localDateIn', () => {
    const instant = zonedTimeToUtc('2026-11-03', '09:00', NJ);
    expect(localDateIn(instant, NJ)).toBe('2026-11-03');
  });

  it('keeps a late-evening shift on its own local date', () => {
    // 9pm Eastern is the next day in UTC, but still Tuesday locally.
    const instant = zonedTimeToUtc('2026-07-14', '21:00', NJ);
    expect(instant.toISOString()).toBe('2026-07-15T01:00:00.000Z');
    expect(localDateIn(instant, NJ)).toBe('2026-07-14');
  });

  it('refuses something that is not a date and time', () => {
    expect(() => zonedTimeToUtc('not-a-date', '09:00', NJ)).toThrow();
  });
});

describe('isoWeekdayOf', () => {
  it('numbers Monday as 1 and Sunday as 7', () => {
    // 2026-09-21 is a Monday.
    expect(isoWeekdayOf('2026-09-21')).toBe(1);
    expect(isoWeekdayOf('2026-09-26')).toBe(6);
    expect(isoWeekdayOf('2026-09-27')).toBe(7);
  });
});

describe('datesBetween', () => {
  it('is inclusive at both ends', () => {
    expect(datesBetween('2026-09-21', '2026-09-24')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  it('returns a single day when both ends match', () => {
    expect(datesBetween('2026-09-21', '2026-09-21')).toEqual(['2026-09-21']);
  });

  it('is empty when the end is before the start', () => {
    expect(datesBetween('2026-09-24', '2026-09-21')).toEqual([]);
  });

  it('does not skip or repeat a day across a clock change', () => {
    // Spanning 1 November 2026.
    const dates = datesBetween('2026-10-30', '2026-11-03');
    expect(dates).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('crosses a month and a year boundary', () => {
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('addDaysTo', () => {
  it('adds and subtracts whole days', () => {
    expect(addDaysTo('2026-09-21', 7)).toBe('2026-09-28');
    expect(addDaysTo('2026-09-21', -7)).toBe('2026-09-14');
  });

  it('crosses a clock change without drifting', () => {
    expect(addDaysTo('2026-10-30', 7)).toBe('2026-11-06');
  });
});
