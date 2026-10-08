import { findPunchPatterns, longestWeekdayRun, PatternEntry } from './punch-patterns';

function punch(date: string, over: Partial<PatternEntry> = {}): PatternEntry {
  return {
    employeeId: 'ana',
    employeeName: 'Ana L',
    date,
    isLate: false,
    isEarlyDeparture: false,
    missedClockOut: false,
    ...over,
  };
}

describe('findPunchPatterns', () => {
  it('needs three late days before calling it a pattern', () => {
    const two = ['2026-10-01', '2026-10-06'].map((d) => punch(d, { isLate: true }));
    expect(findPunchPatterns(two)).toEqual([]);
    const three = [...two, punch('2026-10-07', { isLate: true })];
    expect(findPunchPatterns(three)).toEqual([
      expect.objectContaining({
        kind: 'late',
        count: 3,
        summary: 'Late 3 times in the last 4 weeks',
        dates: ['2026-10-01', '2026-10-06', '2026-10-07'],
      }),
    ]);
  });

  it('says when the late days are the same weekday in a row', () => {
    // Mondays 21 and 28 September, 5 October, and a Wednesday.
    const late = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-07'].map((d) =>
      punch(d, { isLate: true }),
    );
    expect(findPunchPatterns(late)[0].summary).toBe(
      'Late 4 times in the last 4 weeks, 3 Mondays running',
    );
  });

  it('counts a day once, however many punches were late on it', () => {
    const late = ['2026-10-05', '2026-10-05', '2026-10-06'].map((d) => punch(d, { isLate: true }));
    expect(findPunchPatterns(late)).toEqual([]);
  });

  it('calls two missed clock-outs a pattern, and does not also call them leaving early', () => {
    const missed = ['2026-10-02', '2026-10-06'].map((d) =>
      punch(d, { missedClockOut: true, isEarlyDeparture: true }),
    );
    expect(findPunchPatterns(missed)).toEqual([
      expect.objectContaining({
        kind: 'missed-clock-out',
        summary: 'Forgot to clock out twice in the last 4 weeks',
      }),
    ]);
  });

  it('calls two early departures a pattern, per person, most repeated first', () => {
    const patterns = findPunchPatterns([
      punch('2026-10-01', { isEarlyDeparture: true }),
      punch('2026-10-02', { isEarlyDeparture: true }),
      ...['2026-10-01', '2026-10-02', '2026-10-05'].map((d) =>
        punch(d, { employeeId: 'bea', employeeName: 'Bea M', isEarlyDeparture: true }),
      ),
      punch('2026-10-03', { employeeId: 'cy', employeeName: 'Cy P', isEarlyDeparture: true }),
    ]);
    expect(patterns.map((p) => `${p.employeeName}: ${p.summary}`)).toEqual([
      'Bea M: Left early 3 times in the last 4 weeks',
      'Ana L: Left early twice in the last 4 weeks',
    ]);
  });
});

describe('longestWeekdayRun', () => {
  it('finds a run of the same weekday a week apart, not just the same weekday', () => {
    // Mondays 7 Sep, 21 Sep, 28 Sep, 5 Oct: a gap, then three running.
    expect(longestWeekdayRun(['2026-09-07', '2026-09-21', '2026-09-28', '2026-10-05'])).toEqual({
      weekday: 1,
      length: 3,
    });
    expect(longestWeekdayRun(['2026-10-05', '2026-10-06'])).toEqual({ weekday: 1, length: 1 });
  });
});
