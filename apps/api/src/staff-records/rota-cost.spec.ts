import { PayRateUnit, PayType } from '@prisma/client';
import { CostPerson, CostShift, overtimeSpan, rotaCost } from './rota-cost';

const NB = 'loc-nb';
const WNY = 'loc-wny';

/// A shift on a day, "09:00"–"17:00" UTC (the zone does not matter here).
function shift(
  employeeId: string,
  date: string,
  start: string,
  end: string,
  locationId = NB,
): CostShift {
  return {
    employeeId,
    locationId,
    date,
    startsAt: new Date(`${date}T${start}:00Z`),
    endsAt: new Date(`${date}T${end}:00Z`),
  };
}

function person(id: string, overrides: Partial<CostPerson> = {}): CostPerson {
  return {
    id,
    name: id,
    payType: PayType.HOURLY,
    mainLocationId: NB,
    rates: [{ from: '2026-01-01', rate: 20, unit: PayRateUnit.HOURLY }],
    hiredOn: null,
    leftOn: null,
    ...overrides,
  };
}

// Mon 12 Oct 2026 – Sun 18 Oct 2026, overtime weeks starting Monday.
const WEEK = { from: '2026-10-12', to: '2026-10-18', thresholdHours: 40, workweekStartsOn: 1 };

describe('what the rota costs', () => {
  it('prices hourly shifts at the rate in force, by office and day', () => {
    const cost = rotaCost({
      ...WEEK,
      shifts: [
        shift('ana', '2026-10-12', '09:00', '17:00'),
        shift('ana', '2026-10-13', '09:00', '13:00', WNY),
      ],
      people: [person('ana')],
    });
    expect(cost.total).toBe(240);
    expect(cost.hourly).toBe(240);
    expect(cost.scheduledHours).toBe(12);
    expect(cost.byLocation).toEqual([
      { locationId: NB, total: 160, hours: 8 },
      { locationId: WNY, total: 80, hours: 4 },
    ]);
    expect(cost.byDay.find((d) => d.date === '2026-10-13')?.total).toBe(80);
  });

  it('puts hours past forty in the week at time and a half, for hourly staff', () => {
    const shifts = ['12', '13', '14', '15', '16'].map((d) =>
      shift('ana', `2026-10-${d}`, '08:00', '17:00'),
    );
    const cost = rotaCost({ ...WEEK, shifts, people: [person('ana')] });
    // 45 hours: 40 at $20, 5 at $30.
    expect(cost.hourly).toBe(950);
    expect(cost.overtimeHours).toBe(5);
    expect(cost.overtimeExtra).toBe(50);
  });

  it('counts hours earlier in the overtime week, even before the range', () => {
    // Overtime weeks start on Thursday; the screen shows from Sunday.
    const shifts = [
      shift('ana', '2026-10-15', '00:00', '20:00'), // Thu, 20h
      shift('ana', '2026-10-16', '00:00', '20:00'), // Fri, 20h
      shift('ana', '2026-10-18', '09:00', '17:00'), // Sun, 8h — all overtime
    ];
    const cost = rotaCost({
      from: '2026-10-18',
      to: '2026-10-24',
      thresholdHours: 40,
      workweekStartsOn: 4,
      shifts,
      people: [person('ana')],
    });
    expect(cost.hourly).toBe(240);
    expect(cost.overtimeHours).toBe(8);
  });

  it('does not add overtime for salaried staff on an hourly rate', () => {
    const shifts = ['12', '13', '14', '15', '16'].map((d) =>
      shift('dr', `2026-10-${d}`, '08:00', '17:00'),
    );
    const cost = rotaCost({ ...WEEK, shifts, people: [person('dr', { payType: PayType.SALARY })] });
    expect(cost.hourly).toBe(900);
    expect(cost.overtimeHours).toBe(0);
  });

  it('counts a salary a week at a time, on the rota or not, under their offices', () => {
    const doctor = person('dr', {
      payType: PayType.SALARY,
      rates: [{ from: '2026-01-01', rate: 182_000, unit: PayRateUnit.YEARLY }],
    });
    const away = person('admin', {
      payType: PayType.SALARY,
      mainLocationId: WNY,
      rates: [{ from: '2026-01-01', rate: 52_000, unit: PayRateUnit.YEARLY }],
    });
    const cost = rotaCost({
      ...WEEK,
      shifts: [
        shift('dr', '2026-10-12', '09:00', '17:00', NB),
        shift('dr', '2026-10-13', '09:00', '17:00', WNY),
      ],
      people: [doctor, away],
    });
    // A week: 182,000 / 52 = 3,500 and 52,000 / 52 = 1,000.
    expect(cost.salaried).toBe(4500);
    expect(cost.total).toBe(4500);
    expect(cost.byLocation.find((o) => o.locationId === NB)?.total).toBe(1750);
    expect(cost.byLocation.find((o) => o.locationId === WNY)?.total).toBe(2750);
  });

  it('counts a salary only for the days somebody worked here', () => {
    const cost = rotaCost({
      ...WEEK,
      shifts: [],
      people: [
        person('new', {
          payType: PayType.SALARY,
          hiredOn: '2026-10-16',
          rates: [{ from: '2026-01-01', rate: 36_400, unit: PayRateUnit.YEARLY }],
        }),
      ],
    });
    // Fri–Sun: three days at 100 a day.
    expect(cost.salaried).toBe(300);
  });

  it('uses a raise from the day it took effect', () => {
    const cost = rotaCost({
      ...WEEK,
      shifts: [
        shift('ana', '2026-10-12', '09:00', '10:00'),
        shift('ana', '2026-10-14', '09:00', '10:00'),
      ],
      people: [
        person('ana', {
          rates: [
            { from: '2026-01-01', rate: 20, unit: PayRateUnit.HOURLY },
            { from: '2026-10-14', rate: 25, unit: PayRateUnit.HOURLY },
          ],
        }),
      ],
    });
    expect(cost.hourly).toBe(45);
  });

  it('names people on the rota with no pay on file', () => {
    const cost = rotaCost({
      ...WEEK,
      shifts: [shift('bea', '2026-10-12', '09:00', '17:00')],
      people: [person('bea', { name: 'Bea Lopez', rates: [] })],
    });
    expect(cost.total).toBe(0);
    expect(cost.scheduledHours).toBe(8);
    expect(cost.missingPay).toEqual([{ id: 'bea', name: 'Bea Lopez' }]);
  });

  it('widens a range to whole overtime weeks', () => {
    expect(overtimeSpan('2026-10-18', '2026-10-24', 4)).toEqual({
      from: '2026-10-15',
      to: '2026-10-28',
    });
  });
});
