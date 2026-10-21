import { appliesOn, describeShortDay, findShortDays, Minimum, OnDuty } from './minimums';

const frontDesk: Minimum = {
  locationId: 'nb',
  locationName: 'North Bergen',
  jobRoleId: 'fd',
  jobRoleName: 'Front Desk',
  jobRoleOrder: 1,
  minimum: 2,
  weekdays: [],
};
const duty = (employeeId: string, date: string, overrides: Partial<OnDuty> = {}): OnDuty => ({
  employeeId,
  locationId: 'nb',
  jobRoleId: 'fd',
  date,
  ...overrides,
});
const days = () => ['2026-10-13', '2026-10-14'];

describe('days below the minimum', () => {
  it('flags an open day with fewer on in the role than the minimum', () => {
    const short = findShortDays(
      [frontDesk],
      [duty('ana', '2026-10-13'), duty('bea', '2026-10-13'), duty('ana', '2026-10-14')],
      days,
    );
    expect(short).toEqual([expect.objectContaining({ date: '2026-10-14', scheduled: 1 })]);
    expect(describeShortDay(short[0])).toBe(
      'North Bergen, Wed, Oct 14: 1 in Front Desk on the rota, minimum 2',
    );
  });

  it('counts a person once a day, and only in that role at that office', () => {
    const short = findShortDays(
      [frontDesk],
      [
        duty('ana', '2026-10-13'),
        duty('ana', '2026-10-13'),
        duty('bea', '2026-10-13', { jobRoleId: 'ma' }),
        duty('cy', '2026-10-13', { locationId: 'wny' }),
      ],
      () => ['2026-10-13'],
    );
    expect(short.map((day) => day.scheduled)).toEqual([1]);
  });

  it('says nobody when nobody is on, and only on the days the office is open', () => {
    const [day] = findShortDays([frontDesk], [], () => ['2026-10-13']);
    expect(describeShortDay(day)).toBe(
      'North Bergen, Tue, Oct 13: nobody in Front Desk on the rota, minimum 2',
    );
    expect(findShortDays([frontDesk], [], () => [])).toEqual([]);
  });

  it('applies on its weekdays only, and every day when none are chosen', () => {
    // Mon 12 to Fri 16 October 2026; an admin wanted Monday to Thursday.
    const week = () => ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    const monToThu = { ...frontDesk, minimum: 1, weekdays: [1, 2, 3, 4] };
    expect(findShortDays([monToThu], [duty('ana', '2026-10-13')], week).map((d) => d.date)).toEqual(
      ['2026-10-12', '2026-10-14', '2026-10-15'],
    );
    expect(appliesOn([], '2026-10-16')).toBe(true);
    expect(appliesOn([1, 2, 3, 4], '2026-10-16')).toBe(false);
  });
});
