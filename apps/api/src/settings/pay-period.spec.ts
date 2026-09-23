import { PAY_PERIOD_DAYS, payPeriodContaining, payPeriods } from './pay-period';

// A Monday a pay period began.
const ANCHOR = '2026-09-14';

describe('payPeriodContaining', () => {
  it('is fourteen days, first and last day inclusive', () => {
    expect(PAY_PERIOD_DAYS).toBe(14);
    expect(payPeriodContaining('2026-09-14', ANCHOR)).toEqual({
      from: '2026-09-14',
      to: '2026-09-27',
    });
  });

  it('puts the last day of a period in that period, and the next day in the next', () => {
    expect(payPeriodContaining('2026-09-27', ANCHOR).from).toBe('2026-09-14');
    expect(payPeriodContaining('2026-09-28', ANCHOR)).toEqual({
      from: '2026-09-28',
      to: '2026-10-11',
    });
  });

  it('works for dates before the anchor', () => {
    expect(payPeriodContaining('2026-09-13', ANCHOR)).toEqual({
      from: '2026-08-31',
      to: '2026-09-13',
    });
    expect(payPeriodContaining('2026-01-01', ANCHOR)).toEqual({
      from: '2025-12-22',
      to: '2026-01-04',
    });
  });

  it('gives the same periods whichever period start is used as the anchor', () => {
    for (const date of ['2026-02-03', '2026-09-20', '2027-03-15']) {
      expect(payPeriodContaining(date, '2025-06-09')).toEqual(payPeriodContaining(date, ANCHOR));
    }
  });

  it('crosses a clock change without drifting a day', () => {
    // US clocks go back on 1 November 2026.
    expect(payPeriodContaining('2026-11-05', ANCHOR)).toEqual({
      from: '2026-10-26',
      to: '2026-11-08',
    });
  });
});

describe('payPeriods', () => {
  it('gives this period and the one before', () => {
    expect(payPeriods('2026-09-23', ANCHOR)).toEqual({
      current: { from: '2026-09-14', to: '2026-09-27' },
      previous: { from: '2026-08-31', to: '2026-09-13' },
    });
  });

  it('gives nothing until an anchor is set', () => {
    expect(payPeriods('2026-09-23', null)).toEqual({ current: null, previous: null });
  });
});
