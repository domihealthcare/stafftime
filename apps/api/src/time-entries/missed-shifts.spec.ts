import { describeMissedShift, findMissedShifts, PastShift } from './missed-shifts';

// Friday 9 October 2026, 2pm in New Jersey.
const NOW = new Date('2026-10-09T18:00:00Z');
const at = (iso: string) => new Date(iso);

function shift(overrides: Partial<PastShift> = {}): PastShift {
  return {
    id: 'shift-1',
    employeeId: 'emp-1',
    employeeName: 'Frankie Front-Desk',
    locationId: 'nb',
    locationName: 'North Bergen',
    isRemote: false,
    // Tuesday 6 October, 9am–5pm in New Jersey.
    startsAt: at('2026-10-06T13:00:00Z'),
    endsAt: at('2026-10-06T21:00:00Z'),
    ...overrides,
  };
}
const none = { punches: [], leave: [], closures: [] };

describe('shifts nobody turned up for', () => {
  it('lists a shift that is over with no punch that day', () => {
    expect(findMissedShifts({ now: NOW, shifts: [shift()], ...none })).toHaveLength(1);
  });

  it('says nothing while the shift is still going', () => {
    const today = shift({
      startsAt: at('2026-10-09T13:00:00Z'),
      endsAt: at('2026-10-09T21:00:00Z'),
    });
    expect(findMissedShifts({ now: NOW, shifts: [today], ...none })).toEqual([]);
  });

  it('counts any punch that day — late, early, by hand — as turning up', () => {
    const lateAndShort = {
      employeeId: 'emp-1',
      clockInAt: at('2026-10-06T19:00:00Z'),
      clockOutAt: at('2026-10-06T20:00:00Z'),
    };
    expect(
      findMissedShifts({ ...none, now: NOW, shifts: [shift()], punches: [lateAndShort] }),
    ).toEqual([]);
    const somebodyElse = { ...lateAndShort, employeeId: 'emp-2' };
    expect(
      findMissedShifts({ ...none, now: NOW, shifts: [shift()], punches: [somebodyElse] }),
    ).toHaveLength(1);
  });

  it('counts a punch from the evening before for a shift past midnight', () => {
    const overnight = shift({
      startsAt: at('2026-10-07T04:30:00Z'),
      endsAt: at('2026-10-07T10:00:00Z'),
    });
    const punch = {
      employeeId: 'emp-1',
      clockInAt: at('2026-10-07T03:55:00Z'),
      clockOutAt: at('2026-10-07T10:00:00Z'),
    };
    expect(findMissedShifts({ ...none, now: NOW, shifts: [overnight], punches: [punch] })).toEqual(
      [],
    );
  });

  it('leaves out approved time off that day and a closure of that office', () => {
    const leave = [{ employeeId: 'emp-1', from: '2026-10-05', to: '2026-10-06' }];
    expect(findMissedShifts({ ...none, now: NOW, shifts: [shift()], leave })).toEqual([]);
    const closedHere = [
      {
        locationId: 'nb',
        startsAt: at('2026-10-06T04:00:00Z'),
        endsAt: at('2026-10-07T04:00:00Z'),
      },
    ];
    expect(
      findMissedShifts({ ...none, now: NOW, shifts: [shift()], closures: closedHere }),
    ).toEqual([]);
    const closedThere = [{ ...closedHere[0], locationId: 'wny' }];
    expect(
      findMissedShifts({ ...none, now: NOW, shifts: [shift()], closures: closedThere }),
    ).toHaveLength(1);
    const bothClosed = [{ ...closedHere[0], locationId: null }];
    expect(
      findMissedShifts({ ...none, now: NOW, shifts: [shift()], closures: bothClosed }),
    ).toEqual([]);
  });

  it('says who, when and where', () => {
    expect(describeMissedShift(shift())).toBe(
      'Frankie Front-Desk — Tue, Oct 6, 9:00 AM–5:00 PM at North Bergen',
    );
    expect(describeMissedShift(shift({ isRemote: true }))).toBe(
      'Frankie Front-Desk — Tue, Oct 6, 9:00 AM–5:00 PM working from home',
    );
  });
});
