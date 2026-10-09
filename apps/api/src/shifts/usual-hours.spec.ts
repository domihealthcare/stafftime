import { PastShiftTimes, RegularShiftTimes, usualShiftFor } from './usual-hours';

// Monday 12 October 2026.
const MONDAY = '2026-10-12';

function past(date: string, overrides: Partial<PastShiftTimes> = {}): PastShiftTimes {
  return {
    date,
    startTime: '07:00',
    endTime: '15:00',
    locationId: 'wny',
    isRemote: false,
    jobRoleId: 'ma',
    ...overrides,
  };
}

function regular(overrides: Partial<RegularShiftTimes> = {}): RegularShiftTimes {
  return {
    daysOfWeek: [1],
    startTime: '08:00',
    endTime: '16:00',
    locationId: 'nb',
    isRemote: false,
    jobRoleId: 'fd',
    startsOn: '2026-09-01',
    endsOn: null,
    ...overrides,
  };
}

describe('the hours a new shift starts on', () => {
  it('is their regular shift for that day, first', () => {
    expect(usualShiftFor(MONDAY, [regular()], [past('2026-10-05'), past('2026-09-28')])).toEqual({
      startTime: '08:00',
      endTime: '16:00',
      locationId: 'nb',
      isRemote: false,
      jobRoleId: 'fd',
      from: 'regular',
    });
  });

  it('ignores a regular shift on other days, other weeks, or ended', () => {
    const lateMondays = [past('2026-10-05'), past('2026-09-28')];
    for (const series of [
      regular({ daysOfWeek: [2] }),
      regular({ everyWeeks: 2, cycleFrom: '2026-10-05' }),
      regular({ endsOn: '2026-10-11' }),
    ]) {
      expect(usualShiftFor(MONDAY, [series], lateMondays)?.from).toBe('weekday');
    }
  });

  it('is what they worked most often on that weekday — at least twice', () => {
    const mondays = [
      past('2026-10-05'),
      past('2026-09-28'),
      past('2026-09-21', { startTime: '09:00', endTime: '17:00' }),
    ];
    expect(usualShiftFor(MONDAY, [], mondays)).toMatchObject({
      startTime: '07:00',
      endTime: '15:00',
      from: 'weekday',
    });
    expect(usualShiftFor(MONDAY, [], [past('2026-10-05')])).toBeNull();
  });

  it('falls back to any day when that weekday has nothing settled, at least three times', () => {
    const weekdays = [past('2026-10-06'), past('2026-10-07'), past('2026-10-08')];
    expect(usualShiftFor(MONDAY, [], weekdays)?.from).toBe('recent');
    expect(usualShiftFor(MONDAY, [], weekdays.slice(0, 2))).toBeNull();
  });

  it('breaks a tie by the latest, and takes the latest job role', () => {
    const tied = [
      past('2026-09-21', { startTime: '09:00', endTime: '17:00' }),
      past('2026-09-28', { startTime: '09:00', endTime: '17:00' }),
      past('2026-09-14', { jobRoleId: 'old' }),
      past('2026-10-05', { jobRoleId: 'new' }),
    ];
    expect(usualShiftFor(MONDAY, [], tied)).toMatchObject({ startTime: '07:00', jobRoleId: 'new' });
  });
});
