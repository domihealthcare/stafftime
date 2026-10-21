import { adminOn, adminRules, concernsFor } from './office-admins';

// Monday 26 to Friday 30 October 2026.
const MONDAY = '2026-10-26';
const FRIDAY = '2026-10-30';

describe('who is the admin in the office', () => {
  const usual = [
    { locationId: 'wny', weekday: 1, employeeId: 'tatiyana' },
    { locationId: 'wny', weekday: 2, employeeId: 'celeste' },
  ];

  it('follows the usual pattern, and is nobody on a day it has nobody', () => {
    const rules = adminRules(usual, [], ['tatiyana', 'celeste']);
    expect(adminOn(MONDAY, 'wny', rules)).toMatchObject({
      employeeId: 'tatiyana',
      source: 'USUAL',
      usualDay: true,
    });
    expect(adminOn(FRIDAY, 'wny', rules)).toMatchObject({
      employeeId: null,
      source: 'NONE',
      usualDay: false,
    });
  });

  it('lets a changed day win, for somebody else or for nobody', () => {
    const rules = adminRules(
      usual,
      [
        { date: MONDAY, locationId: 'wny', employeeId: 'celeste', note: 'Tatiyana is off' },
        { date: '2026-10-27', locationId: 'wny', employeeId: null, note: null },
      ],
      ['tatiyana', 'celeste'],
    );
    expect(adminOn(MONDAY, 'wny', rules)).toMatchObject({
      employeeId: 'celeste',
      source: 'CHANGED',
      note: 'Tatiyana is off',
    });
    expect(adminOn('2026-10-27', 'wny', rules)).toMatchObject({
      employeeId: null,
      source: 'CHANGED',
    });
  });

  it('counts somebody who has left as nobody', () => {
    const rules = adminRules(usual, [], ['celeste']);
    expect(adminOn(MONDAY, 'wny', rules)).toMatchObject({ employeeId: null, source: 'NONE' });
  });

  it('flags time off, a missing shift and a gap, and nothing on a day nobody is wanted', () => {
    const rules = adminRules(usual, [], ['tatiyana', 'celeste']);
    const monday = adminOn(MONDAY, 'wny', rules);
    expect(concernsFor(monday, { onRota: true, off: null })).toEqual([]);
    expect(concernsFor(monday, { onRota: false, off: null })).toEqual(['NOT_ON_ROTA']);
    expect(concernsFor(monday, { onRota: false, off: 'FULL' })).toEqual(['OFF']);
    expect(concernsFor(monday, { onRota: true, off: 'HALF' })).toEqual(['HALF_DAY_OFF']);
    const gone = adminOn(MONDAY, 'wny', adminRules(usual, [], []));
    expect(concernsFor(gone, { onRota: false, off: null })).toEqual(['NOBODY']);
    expect(concernsFor(adminOn(FRIDAY, 'wny', rules), { onRota: false, off: null })).toEqual([]);
  });
});
