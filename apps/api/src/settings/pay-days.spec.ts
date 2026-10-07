import { payDayFor, payDaysBetween } from './pay-days';

describe('pay days', () => {
  it('is the Friday after a period ends', () => {
    // A period Sunday 18 October – Saturday 31 October 2026 is paid Friday 6 November.
    expect(payDayFor('2026-10-31')).toBe('2026-11-06');
    // Ending on a Wednesday: the Friday two days later.
    expect(payDayFor('2026-11-04')).toBe('2026-11-06');
  });

  it('is a week later when the period ends on a Friday', () => {
    expect(payDayFor('2026-10-30')).toBe('2026-11-06');
  });

  it('lists every pay day in a range, a fortnight apart', () => {
    expect(payDaysBetween('2026-11-01', '2026-12-31', '2026-10-18')).toEqual([
      '2026-11-06',
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
    ]);
  });

  it('counts a pay day on either edge of the range', () => {
    expect(payDaysBetween('2026-11-06', '2026-11-20', '2026-10-18')).toEqual([
      '2026-11-06',
      '2026-11-20',
    ]);
  });

  it('works from an anchor after the range', () => {
    expect(payDaysBetween('2026-11-01', '2026-11-30', '2027-03-07')).toEqual([
      '2026-11-06',
      '2026-11-20',
    ]);
  });

  it('is empty until a pay period is set', () => {
    expect(payDaysBetween('2026-11-01', '2026-12-31', null)).toEqual([]);
  });
});
