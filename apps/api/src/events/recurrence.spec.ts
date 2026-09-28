import { describeRule, occurrenceDates, ruleProblem, weekOfMonth } from './recurrence';

describe('occurrenceDates', () => {
  it('lands every 2 weeks on a Friday — the office meeting', () => {
    expect(
      occurrenceDates('2026-10-02', {
        frequency: 'WEEKLY',
        interval: 2,
        weekdays: [5],
        until: '2026-11-13',
      }),
    ).toEqual(['2026-10-02', '2026-10-16', '2026-10-30', '2026-11-13']);
  });

  it('alternates with a second series starting the week after — the admin meeting', () => {
    expect(
      occurrenceDates('2026-10-09', {
        frequency: 'WEEKLY',
        interval: 2,
        weekdays: [5],
        until: '2026-11-13',
      }),
    ).toEqual(['2026-10-09', '2026-10-23', '2026-11-06']);
  });

  it('keeps several weekdays in the same fortnight: every 2 weeks on Monday and Friday', () => {
    // Starting on a Friday: that Friday, then the Monday and Friday two weeks on.
    expect(
      occurrenceDates('2026-10-02', {
        frequency: 'WEEKLY',
        interval: 2,
        weekdays: [5, 1],
        until: '2026-10-31',
      }),
    ).toEqual(['2026-10-02', '2026-10-12', '2026-10-16', '2026-10-26', '2026-10-30']);
  });

  it('only includes the first date when it is one of the chosen days', () => {
    // A Wednesday start for a Monday meeting begins the Monday after.
    expect(
      occurrenceDates('2026-09-30', {
        frequency: 'WEEKLY',
        interval: 1,
        weekdays: [1],
        until: '2026-10-13',
      }),
    ).toEqual(['2026-10-05', '2026-10-12']);
  });

  it('runs straight through the clocks going back — dates, not instants', () => {
    expect(
      occurrenceDates('2026-10-30', {
        frequency: 'WEEKLY',
        interval: 1,
        weekdays: [5],
        until: '2026-11-06',
      }),
    ).toEqual(['2026-10-30', '2026-11-06']);
  });

  it('repeats on the same date each month, skipping months without it', () => {
    expect(
      occurrenceDates('2027-01-31', {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyMode: 'DAY_OF_MONTH',
        until: '2027-05-31',
      }),
    ).toEqual(['2027-01-31', '2027-03-31', '2027-05-31']);
  });

  it('repeats on the first Friday of the month', () => {
    expect(
      occurrenceDates('2026-10-02', {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyMode: 'WEEKDAY_OF_MONTH',
        monthlyWeek: 1,
        until: '2027-01-31',
      }),
    ).toEqual(['2026-10-02', '2026-11-06', '2026-12-04', '2027-01-01']);
  });

  it('repeats on the last Friday of the month, every other month', () => {
    expect(
      occurrenceDates('2026-10-30', {
        frequency: 'MONTHLY',
        interval: 2,
        monthlyMode: 'WEEKDAY_OF_MONTH',
        monthlyWeek: -1,
        until: '2027-03-31',
      }),
    ).toEqual(['2026-10-30', '2026-12-25', '2027-02-26']);
  });

  it('crosses a year end', () => {
    expect(
      occurrenceDates('2026-12-15', {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyMode: 'DAY_OF_MONTH',
        until: '2027-02-15',
      }),
    ).toEqual(['2026-12-15', '2027-01-15', '2027-02-15']);
  });
});

describe('ruleProblem', () => {
  const weekly = { frequency: 'WEEKLY' as const, interval: 1, weekdays: [5], until: '2026-12-31' };

  it('accepts a sensible rule', () => {
    expect(ruleProblem('2026-10-02', weekly)).toBeNull();
  });

  it('refuses no weekdays, a stop before the start, and more than a year', () => {
    expect(ruleProblem('2026-10-02', { ...weekly, weekdays: [] })).toMatch(/at least one day/);
    expect(ruleProblem('2026-10-02', { ...weekly, until: '2026-10-01' })).toMatch(
      /after it starts/,
    );
    expect(ruleProblem('2026-10-02', { ...weekly, until: '2027-10-05' })).toMatch(/at most a year/);
    expect(ruleProblem('2026-10-02', { ...weekly, interval: 0 })).toMatch(/1 to 12/);
  });

  it('needs a week of the month for "the first Friday"', () => {
    expect(
      ruleProblem('2026-10-02', {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyMode: 'WEEKDAY_OF_MONTH',
        monthlyWeek: 7,
        until: '2026-12-31',
      }),
    ).toMatch(/first, second/);
  });
});

describe('describeRule', () => {
  it('says it the way a person would', () => {
    expect(
      describeRule('2026-10-02', {
        frequency: 'WEEKLY',
        interval: 2,
        weekdays: [5, 1],
        until: '2026-12-31',
      }),
    ).toBe('Every 2 weeks on Mon and Fri until Dec 31, 2026');
    expect(
      describeRule('2026-10-02', {
        frequency: 'MONTHLY',
        interval: 1,
        monthlyMode: 'WEEKDAY_OF_MONTH',
        monthlyWeek: 1,
        until: '2027-06-30',
      }),
    ).toBe('Every month on the first Friday until Jun 30, 2027');
    expect(
      describeRule('2026-10-22', {
        frequency: 'MONTHLY',
        interval: 3,
        monthlyMode: 'DAY_OF_MONTH',
        until: '2027-06-30',
      }),
    ).toBe('Every 3 months on the 22nd until Jun 30, 2027');
  });
});

describe('weekOfMonth', () => {
  it('counts weeks of the month, calling the fifth the last', () => {
    expect(weekOfMonth('2026-10-02')).toBe(1);
    expect(weekOfMonth('2026-10-23')).toBe(4);
    expect(weekOfMonth('2026-10-30')).toBe(-1);
  });
});
