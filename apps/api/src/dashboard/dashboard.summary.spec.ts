import { PayType, PtoType } from '@prisma/client';
import { EntryIn, summarise } from './dashboard.summary';

const NJ = 'America/New_York';
const WEEKS = ['2026-09-14', '2026-09-21'];

/// A punch of `hours` from 9am Eastern (13:00 UTC) on `date`.
function punch(date: string, hours: number, over: Partial<EntryIn> = {}): EntryIn {
  const clockInAt = new Date(`${date}T13:00:00Z`);
  return {
    employeeId: 'emp-1',
    employeeName: 'Frankie Front-Desk',
    locationId: 'nb',
    timezone: NJ,
    payType: PayType.HOURLY,
    clockInAt,
    clockOutAt: new Date(clockInAt.getTime() + hours * 3_600_000),
    isLate: false,
    isEarlyDeparture: false,
    ...over,
  };
}

const run = (input: Partial<Parameters<typeof summarise>[0]>) =>
  summarise({
    weekStarts: WEEKS,
    locationIds: ['nb', 'wny'],
    entries: [],
    shifts: [],
    leave: [],
    overtimeThresholdHours: 40,
    ...input,
  });

describe('summarise', () => {
  it('adds worked hours by location and week', () => {
    const [first, second] = run({
      entries: [
        punch('2026-09-15', 8),
        punch('2026-09-22', 6),
        punch('2026-09-23', 4, { locationId: 'wny' }),
      ],
    });
    expect(first.total.workedHours).toBe(8);
    expect(second.byLocation).toEqual([
      expect.objectContaining({ locationId: 'nb', workedHours: 6, punches: 1 }),
      expect.objectContaining({ locationId: 'wny', workedHours: 4, punches: 1 }),
    ]);
  });

  it('counts an open punch as a punch but not as hours', () => {
    const [, week] = run({ entries: [punch('2026-09-22', 8, { clockOutAt: null })] });
    expect(week.total).toMatchObject({ punches: 1, workedHours: 0 });
  });

  it('puts a late Sunday evening punch in the week it was worked in New Jersey', () => {
    // 11pm Sunday 20 September Eastern is 3am Monday in UTC.
    const lateSunday = punch('2026-09-20', 1, {
      clockInAt: new Date('2026-09-21T03:00:00Z'),
      clockOutAt: new Date('2026-09-21T04:00:00Z'),
    });
    const [first, second] = run({ entries: [lateSunday] });
    expect(first.total.workedHours).toBe(1);
    expect(second.total.workedHours).toBe(0);
  });

  it('counts lateness and early departures', () => {
    const [, week] = run({
      entries: [
        punch('2026-09-21', 8, { isLate: true }),
        punch('2026-09-22', 8, { isEarlyDeparture: true }),
        punch('2026-09-23', 8),
      ],
    });
    expect(week.total).toMatchObject({ punches: 3, late: 1, earlyDepartures: 1 });
  });

  it('finds overtime across both locations, for hourly staff only', () => {
    const days = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    const [, week] = run({
      entries: [
        // Frankie: 24 at North Bergen + 20 at West New York = 44.
        ...days.slice(0, 3).map((d) => punch(d, 8)),
        ...days.slice(3).map((d) => punch(d, 10, { locationId: 'wny' })),
        // A salaried provider on 50 is not overtime.
        ...days.map((d) =>
          punch(d, 10, {
            employeeId: 'emp-9',
            employeeName: 'Dr. Salaried',
            payType: PayType.SALARY,
          }),
        ),
      ],
    });
    expect(week.overtime).toEqual([{ name: 'Frankie Front-Desk', hours: 44, overtimeHours: 4 }]);
    expect(week.total.overtimeHours).toBe(4);
  });

  it('uses the practice’s threshold, not forty', () => {
    const [, week] = run({ entries: [punch('2026-09-21', 12)], overtimeThresholdHours: 10 });
    expect(week.overtime[0]).toMatchObject({ overtimeHours: 2 });
  });

  it('adds scheduled hours from the rota', () => {
    const [, week] = run({
      shifts: [
        {
          locationId: 'wny',
          timezone: NJ,
          startsAt: new Date('2026-09-22T13:00:00Z'),
          endsAt: new Date('2026-09-22T21:00:00Z'),
        },
      ],
    });
    expect(week.byLocation[1].scheduledHours).toBe(8);
  });

  it('counts time off in weekdays, halves as halves, and by type', () => {
    const [first, second] = run({
      leave: [
        // Thursday 17 to Tuesday 22: Thu, Fri | (weekend) | Mon, Tue.
        {
          locationId: 'nb',
          type: PtoType.VACATION,
          startDate: '2026-09-17',
          endDate: '2026-09-22',
          isHalfDay: false,
        },
        {
          locationId: null,
          type: PtoType.SICK,
          startDate: '2026-09-24',
          endDate: '2026-09-24',
          isHalfDay: true,
        },
      ],
    });
    expect(first.total.timeOffDays).toBe(2);
    expect(second.total.timeOffDays).toBe(2.5);
    expect(second.byLocation[0].timeOffDays).toBe(2);
    expect(second.timeOffByType).toEqual({ VACATION: 2, SICK: 0.5 });
  });

  it('ignores anything outside the weeks asked for', () => {
    const weeks = run({ entries: [punch('2026-09-01', 8), punch('2026-10-05', 8)] });
    expect(weeks.every((week) => week.total.punches === 0)).toBe(true);
  });
});
