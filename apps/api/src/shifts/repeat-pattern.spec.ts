import { datesBetween } from '../common/util/zoned-time.util';
import { isEveryWeek, onPattern, patternPhrase, patternProblem } from './repeat-pattern';

const SAT = 6;
const MON = 1;
const FRI = 5;

function on(from: string, until: string, pattern: Parameters<typeof onPattern>[1]) {
  return datesBetween(from, until).filter((date) => onPattern(date, pattern));
}

describe('repeat patterns', () => {
  it('every week is every one of the chosen days', () => {
    expect(on('2026-10-01', '2026-10-31', { daysOfWeek: [SAT] })).toEqual([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
    ]);
  });

  it('the first Saturday of the month is the one on the 1st to the 7th', () => {
    expect(on('2026-10-01', '2027-01-31', { daysOfWeek: [SAT], weeksOfMonth: [1] })).toEqual([
      '2026-10-03',
      '2026-11-07',
      '2026-12-05',
      '2027-01-02',
    ]);
  });

  it('the first and third, together', () => {
    expect(on('2026-10-01', '2026-11-30', { daysOfWeek: [SAT], weeksOfMonth: [1, 3] })).toEqual([
      '2026-10-03',
      '2026-10-17',
      '2026-11-07',
      '2026-11-21',
    ]);
  });

  it('the last is the last, a fifth one included', () => {
    // October 2026 has five Saturdays; November four.
    expect(on('2026-10-01', '2026-11-30', { daysOfWeek: [SAT], weeksOfMonth: [-1] })).toEqual([
      '2026-10-31',
      '2026-11-28',
    ]);
    // A fifth Saturday is not the fourth.
    expect(on('2026-10-01', '2026-10-31', { daysOfWeek: [SAT], weeksOfMonth: [4] })).toEqual([
      '2026-10-24',
    ]);
  });

  it('a fourth that is also the last is both', () => {
    expect(on('2026-11-01', '2026-11-30', { daysOfWeek: [SAT], weeksOfMonth: [4, -1] })).toEqual([
      '2026-11-28',
    ]);
  });

  it('several days in the same week of the month', () => {
    // The first Monday and the first Friday of October 2026.
    expect(on('2026-10-01', '2026-10-31', { daysOfWeek: [MON, FRI], weeksOfMonth: [1] })).toEqual([
      '2026-10-02',
      '2026-10-05',
    ]);
  });

  it('every other week counts calendar weeks, Sunday first, from the first', () => {
    // Starting Wednesday 7 October: that week (Sun 4 Oct) is on, the next off.
    expect(
      on('2026-10-07', '2026-11-08', {
        daysOfWeek: [MON, SAT],
        everyWeeks: 2,
        cycleFrom: '2026-10-07',
      }),
    ).toEqual(['2026-10-10', '2026-10-19', '2026-10-24', '2026-11-02', '2026-11-07']);
  });

  it('every other week keeps its rhythm whatever date it is asked about', () => {
    const pattern = { daysOfWeek: [SAT], everyWeeks: 2, cycleFrom: '2026-10-03' };
    expect(onPattern('2026-12-26', pattern)).toBe(true);
    expect(onPattern('2027-01-02', pattern)).toBe(false);
    // And before it, the same way round.
    expect(onPattern('2026-09-19', pattern)).toBe(true);
    expect(onPattern('2026-09-26', pattern)).toBe(false);
  });

  it('every four weeks', () => {
    expect(
      on('2026-10-01', '2026-12-31', {
        daysOfWeek: [SAT],
        everyWeeks: 4,
        cycleFrom: '2026-10-03',
      }),
    ).toEqual(['2026-10-03', '2026-10-31', '2026-11-28', '2026-12-26']);
  });

  it('says what is wrong with one', () => {
    expect(patternProblem({ daysOfWeek: [SAT] })).toBeNull();
    expect(patternProblem({ daysOfWeek: [SAT], everyWeeks: 5 })).toMatch(/every 2 to 4/);
    expect(patternProblem({ daysOfWeek: [SAT], weeksOfMonth: [5] })).toMatch(/last week/);
    expect(patternProblem({ daysOfWeek: [SAT], everyWeeks: 2, weeksOfMonth: [1] })).toMatch(
      /not both/,
    );
  });

  it('knows a plain weekly one', () => {
    expect(isEveryWeek({ daysOfWeek: [MON] })).toBe(true);
    expect(isEveryWeek({ daysOfWeek: [MON], everyWeeks: 1, weeksOfMonth: [] })).toBe(true);
    expect(isEveryWeek({ daysOfWeek: [MON], everyWeeks: 2 })).toBe(false);
    expect(isEveryWeek({ daysOfWeek: [MON], weeksOfMonth: [1] })).toBe(false);
  });

  it('puts it in words', () => {
    expect(patternPhrase({ daysOfWeek: [FRI, MON] })).toBe('Mondays and Fridays');
    expect(patternPhrase({ daysOfWeek: [SAT], weeksOfMonth: [1] })).toBe(
      'the first Saturday of the month',
    );
    expect(patternPhrase({ daysOfWeek: [SAT], weeksOfMonth: [-1, 3, 1] })).toBe(
      'the first, third and last Saturday of the month',
    );
    expect(patternPhrase({ daysOfWeek: [SAT], everyWeeks: 2 })).toBe('every other Saturday');
    expect(patternPhrase({ daysOfWeek: [7, MON], everyWeeks: 3 })).toBe(
      'every third Sunday and Monday',
    );
  });
});
