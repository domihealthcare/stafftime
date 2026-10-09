import { UnavailabilityKind } from '@prisma/client';
import {
  describeRegularShiftClash,
  PersonRule,
  RegularShift,
  regularShiftClashes,
} from './regular-shift-clashes';

// Friday 9 October 2026.
const TODAY = '2026-10-09';

function shift(overrides: Partial<RegularShift> = {}): RegularShift {
  return {
    id: 'series-1',
    employeeId: 'emp-1',
    employeeName: 'Frankie Front-Desk',
    locationName: 'North Bergen',
    isRemote: false,
    daysOfWeek: [1],
    startTime: '09:00',
    endTime: '17:00',
    startsOn: '2026-09-01',
    endsOn: null,
    ...overrides,
  };
}

function rule(overrides: Partial<PersonRule> = {}): PersonRule {
  return {
    id: 'rule-1',
    employeeId: 'emp-1',
    kind: UnavailabilityKind.WEEKLY,
    weekday: 1,
    date: null,
    startTime: '15:00',
    endTime: '21:00',
    effectiveFrom: '2026-10-19',
    effectiveUntil: null,
    ...overrides,
  };
}

describe('availability that clashes with a regular shift', () => {
  it('finds a weekly rule that overlaps the shift, from the first date they meet', () => {
    const [clash] = regularShiftClashes([shift()], [rule()], TODAY);
    expect(clash.firstDate).toBe('2026-10-19');
    expect(describeRegularShiftClash(clash)).toBe(
      'Frankie Front-Desk — regular Mondays 9:00 AM–5:00 PM at North Bergen, but not available Mondays, 3:00 PM–9:00 PM (from Mon, Oct 19)',
    );
  });

  it('says nothing when the hours only touch, or the day differs, or it is somebody else', () => {
    expect(regularShiftClashes([shift()], [rule({ startTime: '17:00' })], TODAY)).toEqual([]);
    expect(regularShiftClashes([shift()], [rule({ weekday: 2 })], TODAY)).toEqual([]);
    expect(regularShiftClashes([shift()], [rule({ employeeId: 'emp-2' })], TODAY)).toEqual([]);
  });

  it('follows which weeks the regular shift is on, and when it stops', () => {
    // A one-off on Monday 26 October against every other Monday from 19 Oct.
    const oneOff = rule({
      kind: UnavailabilityKind.ONE_OFF,
      weekday: null,
      date: '2026-10-26',
      effectiveFrom: '2026-10-26',
      startTime: null,
      endTime: null,
    });
    const everyOther = shift({ everyWeeks: 2, cycleFrom: '2026-10-19' });
    expect(regularShiftClashes([everyOther], [oneOff], TODAY)).toEqual([]);
    expect(regularShiftClashes([shift()], [oneOff], TODAY)).toHaveLength(1);
    expect(regularShiftClashes([shift({ endsOn: '2026-10-20' })], [oneOff], TODAY)).toEqual([]);
  });

  it('counts a shift past midnight against the evening of its first day', () => {
    const late = shift({ startTime: '20:00', endTime: '02:00' });
    expect(
      regularShiftClashes([late], [rule({ startTime: '22:00', endTime: '23:00' })], TODAY),
    ).toHaveLength(1);
  });
});
