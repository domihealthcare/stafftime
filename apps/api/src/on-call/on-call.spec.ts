import { addDaysTo, datesBetween } from '../common/util/zoned-time.util';
import { onCallOn, RotaRule, turnDateAt, weekOfMonthOf, entryWords } from './on-call';

const D = 'dominguez';
const B = 'badia';

// As Dominguez described it: Mon, Tue, Wed, Fri and every weekend except the
// 4th; Dr. Badia Thursdays and the 4th weekend.
const PRACTICE: RotaRule = {
  startsOn: '2026-10-01',
  changesAt: '12:00',
  entries: [
    { weekday: 1, weekOfMonth: 0, employeeId: D },
    { weekday: 2, weekOfMonth: 0, employeeId: D },
    { weekday: 3, weekOfMonth: 0, employeeId: D },
    { weekday: 4, weekOfMonth: 0, employeeId: B },
    { weekday: 5, weekOfMonth: 0, employeeId: D },
    { weekday: 6, weekOfMonth: 0, employeeId: D },
    { weekday: 7, weekOfMonth: 0, employeeId: D },
    { weekday: 6, weekOfMonth: 4, employeeId: B },
    { weekday: 7, weekOfMonth: 4, employeeId: B },
  ],
};

const who = (date: string, rotas = [PRACTICE], changed = new Map()) =>
  onCallOn(date, rotas, changed).employeeId;

describe('who is on call', () => {
  it('follows the weekdays', () => {
    // Mon 12 Oct 2026 … Fri 16 Oct.
    expect(['12', '13', '14', '15', '16'].map((d) => who(`2026-10-${d}`))).toEqual([D, D, D, B, D]);
  });

  it('gives the 4th weekend to Dr. Badia, and the others to Dr. Dominguez', () => {
    // October 2026's Saturdays: 3, 10, 17, 24, 31.
    expect(who('2026-10-17')).toBe(D);
    expect(who('2026-10-18')).toBe(D);
    expect(who('2026-10-24')).toBe(B);
    expect(who('2026-10-25')).toBe(B);
    expect(who('2026-10-31')).toBe(D);
  });

  it('counts a Sunday with the Saturday before it, even across the month', () => {
    // November 2026 starts on a Sunday: the 1st belongs to October's 5th weekend.
    expect(weekOfMonthOf('2026-11-01')).toEqual({ nth: 5, last: true });
    // August 2026: Saturdays 1, 8, 15, 22, 29 — the 4th weekend is 22–23.
    expect(weekOfMonthOf('2026-08-23')).toEqual({ nth: 4, last: false });
    // January 2027: Saturdays 2, 9, 16, 23, 30 — the 4th weekend is 23–24.
    expect(who('2027-01-23')).toBe(B);
    expect(who('2027-01-24')).toBe(B);
  });

  it('has exactly one 4th weekend in every month for a year', () => {
    const days = datesBetween('2026-10-01', '2027-09-30');
    const badiaWeekends = days.filter((date) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      return weekday === 6 && who(date) === B;
    });
    expect(badiaWeekends).toHaveLength(12);
    for (const saturday of badiaWeekends) expect(who(addDaysTo(saturday, 1))).toBe(B);
  });

  it('prefers a week of the month, then the last, then every week', () => {
    const rota: RotaRule = {
      startsOn: '2026-01-01',
      changesAt: '12:00',
      entries: [
        { weekday: 5, weekOfMonth: 0, employeeId: 'every' },
        { weekday: 5, weekOfMonth: -1, employeeId: 'last' },
        { weekday: 5, weekOfMonth: 2, employeeId: 'second' },
      ],
    };
    // Fridays of October 2026: 2, 9, 16, 23, 30.
    expect(who('2026-10-02', [rota])).toBe('every');
    expect(who('2026-10-09', [rota])).toBe('second');
    expect(who('2026-10-30', [rota])).toBe('last');
  });

  it('uses the rota in force on the day', () => {
    const later: RotaRule = {
      ...PRACTICE,
      startsOn: '2026-11-01',
      entries: [{ weekday: 1, weekOfMonth: 0, employeeId: B }],
    };
    expect(who('2026-10-26', [PRACTICE, later])).toBe(D);
    expect(who('2026-11-02', [PRACTICE, later])).toBe(B);
    expect(onCallOn('2026-09-30', [PRACTICE], new Map()).source).toBe('NONE');
  });

  it('lets a changed or swapped day win', () => {
    const changed = new Map([['2026-10-12', { employeeId: B, swapped: true }]]);
    const day = onCallOn('2026-10-12', [PRACTICE], changed);
    expect(day).toEqual({
      date: '2026-10-12',
      employeeId: B,
      source: 'SWAPPED',
      changesAt: '12:00',
    });
  });

  it('keeps yesterday’s turn until the hand-over', () => {
    expect(turnDateAt('2026-10-13', '09:30', [PRACTICE])).toBe('2026-10-12');
    expect(turnDateAt('2026-10-13', '12:00', [PRACTICE])).toBe('2026-10-13');
  });

  it('says an entry in words', () => {
    expect(entryWords(1, 0)).toBe('Mondays');
    expect(entryWords(6, 4)).toBe('the 4th Saturday');
    expect(entryWords(5, -1)).toBe('the last Friday');
  });
});
