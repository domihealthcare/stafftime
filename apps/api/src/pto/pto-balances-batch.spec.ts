import { EventAudience, PtoStatus, PtoType } from '@prisma/client';
import { PtoPolicyService } from './pto-policy.service';

/**
 * The staff list (staffBalances) works everybody's balances out from a
 * handful of reads at once (maintenance pass, October 2026). It must give
 * exactly what working each person out alone gives (staffBalanceFor, the
 * path the rest of pto-policy.service.spec.ts tests). This builds a small
 * practice in a fake database that answers both ways of asking, and
 * compares.
 */

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
/// A whole New Jersey day (EDT), as a closure holds it.
const njDay = (value: string) => ({
  startsAt: new Date(`${value}T04:00:00.000Z`),
  endsAt: new Date(new Date(`${value}T04:00:00.000Z`).getTime() + 86_400_000),
});

const POLICY = {
  id: 'policy-1',
  singleton: 1,
  vacationDaysPerYear: 15,
  sickDaysPerYear: 5,
  maxCarryoverDays: 5,
  sickCarryoverDays: 2,
  yearStartMonth: 1,
  yearStartDay: 1,
  prorateFirstYear: true,
  sickAccrualFrom: day('2026-10-16'),
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const point = (policyYear: number, values: Record<string, number | null>) => ({
  policyYear,
  vacationUsed: 0,
  sickUsed: 0,
  vacationCarriedOver: null,
  sickCarriedOver: null,
  ...values,
});

const PEOPLE = [
  {
    // Salaried, here for years, added to the app last year: carry-over walks
    // from 2025, a starting point this year, an office closure in a request.
    id: 'emp-a',
    firstName: 'Angelica',
    lastName: 'A',
    hireDate: day('2020-02-03'),
    createdAt: day('2025-03-01'),
    payType: 'SALARY',
    locations: [{ locationId: 'nb' }],
    ptoAllowance: null,
    ptoStartingPoints: [point(2026, { vacationUsed: 2, sickUsed: 1 })],
  },
  {
    // Hourly, started after the practice's date for earning sick time.
    id: 'emp-b',
    firstName: 'Blake',
    lastName: 'B',
    hireDate: day('2026-10-20'),
    createdAt: day('2026-10-19'),
    payType: 'HOURLY',
    locations: [{ locationId: 'wny' }],
    ptoAllowance: null,
    ptoStartingPoints: [],
  },
  {
    // Hourly before that date, at both offices, with their own allowance.
    id: 'emp-c',
    firstName: 'Casey',
    lastName: 'C',
    hireDate: day('2024-05-06'),
    createdAt: day('2024-05-01'),
    payType: 'HOURLY',
    locations: [{ locationId: 'nb' }, { locationId: 'wny' }],
    ptoAllowance: { vacationDaysPerYear: 10, sickDaysPerYear: null },
    ptoStartingPoints: [point(2026, { vacationCarriedOver: 3 })],
  },
  {
    // No hire date, nothing booked.
    id: 'emp-d',
    firstName: 'Dana',
    lastName: 'D',
    hireDate: null,
    createdAt: day('2026-09-25'),
    payType: 'SALARY',
    locations: [],
    ptoAllowance: null,
    ptoStartingPoints: [],
  },
];

const request = (
  employeeId: string,
  type: PtoType,
  status: PtoStatus,
  from: string,
  to: string,
  isHalfDay = false,
) => ({ employeeId, type, status, startDate: day(from), endDate: day(to), isHalfDay });

const REQUESTS = [
  request('emp-a', PtoType.VACATION, PtoStatus.APPROVED, '2025-06-02', '2025-06-06'),
  request('emp-a', PtoType.SICK, PtoStatus.APPROVED, '2025-11-10', '2025-11-10'),
  request('emp-a', PtoType.VACATION, PtoStatus.APPROVED, '2026-07-01', '2026-07-03'),
  request('emp-a', PtoType.VACATION, PtoStatus.PENDING, '2026-12-28', '2027-01-04'),
  request('emp-a', PtoType.SICK, PtoStatus.APPROVED, '2026-03-05', '2026-03-05', true),
  request('emp-b', PtoType.SICK, PtoStatus.PENDING, '2026-10-27', '2026-10-27'),
  request('emp-c', PtoType.VACATION, PtoStatus.APPROVED, '2025-12-29', '2026-01-02'),
  request('emp-c', PtoType.UNPAID, PtoStatus.APPROVED, '2026-07-02', '2026-07-02'),
  request('emp-c', PtoType.SICK, PtoStatus.APPROVED, '2026-08-10', '2026-08-12'),
  request('emp-c', PtoType.VACATION, PtoStatus.DENIED, '2026-09-01', '2026-09-04'),
];

const CLOSURES = [
  // Everywhere: the 3rd of July.
  { ...njDay('2026-07-03'), audience: EventAudience.EVERYONE, locationId: null },
  // North Bergen only: the 2nd of July, and a day in 2025.
  { ...njDay('2026-07-02'), audience: EventAudience.LOCATION, locationId: 'nb' },
  { ...njDay('2025-06-04'), audience: EventAudience.LOCATION, locationId: 'nb' },
];

const punch = (employeeId: string, date: string, hours: number) => ({
  employeeId,
  clockInAt: new Date(`${date}T13:00:00.000Z`),
  clockOutAt: new Date(new Date(`${date}T13:00:00.000Z`).getTime() + hours * 3_600_000),
});
const ENTRIES = [
  punch('emp-b', '2026-10-20', 8),
  punch('emp-b', '2026-10-21', 7.5),
  punch('emp-b', '2026-10-22', 9),
  punch('emp-c', '2026-10-22', 8),
];

/// Just enough of Prisma's `where` for these reads.
const matchesId = (value: string, rule: unknown) =>
  typeof rule === 'string' ? value === rule : (rule as { in: string[] }).in.includes(value);

function fakePrisma() {
  const nameOf = (person: (typeof PEOPLE)[number]) => ({
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    preferredName: null,
    email: `${person.id}@example.com`,
  });
  const balanceRow = (person: (typeof PEOPLE)[number]) => {
    const { firstName: _first, lastName: _last, ...row } = person;
    return row;
  };
  return {
    ptoPolicy: { findUnique: jest.fn().mockResolvedValue(POLICY) },
    employee: {
      findMany: jest.fn().mockImplementation(({ where, select }) => {
        if (select.hireDate) {
          return Promise.resolve(PEOPLE.filter((p) => matchesId(p.id, where.id)).map(balanceRow));
        }
        return Promise.resolve(PEOPLE.map(nameOf));
      }),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(nameOf(PEOPLE.find((p) => p.id === where.id)!)),
        ),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(balanceRow(PEOPLE.find((p) => p.id === where.id)!)),
        ),
    },
    ptoRequest: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            REQUESTS.filter(
              (r) =>
                matchesId(r.employeeId, where.employeeId) &&
                where.status.in.includes(r.status) &&
                r.startDate < where.startDate.lt &&
                r.endDate >= where.endDate.gte,
            ),
          ),
        ),
    },
    practiceEvent: { findMany: jest.fn().mockResolvedValue(CLOSURES) },
    timeEntry: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            ENTRIES.filter(
              (e) =>
                matchesId(e.employeeId, where.employeeId) &&
                e.clockInAt >= where.clockInAt.gte &&
                e.clockInAt < where.clockInAt.lt,
            ),
          ),
        ),
    },
  };
}

describe('the staff list of time off balances', () => {
  it('gives each person exactly what working them out alone gives', async () => {
    const prisma = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new PtoPolicyService(prisma as any);

    const together = await service.staffBalances();
    const alone = await Promise.all(PEOPLE.map((person) => service.staffBalanceFor(person.id)));

    expect(together.map((row) => row.employee.id)).toEqual(PEOPLE.map((person) => person.id));
    expect(together).toEqual(alone);
    // And the case it is about: sick time earned as worked, for Blake.
    expect(together[1].balance.sick.accrual?.hoursWorked).toBe(24.5);
  });

  it('reads everybody at once, not once per person', async () => {
    const prisma = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new PtoPolicyService(prisma as any);
    await service.staffBalances();

    expect(prisma.ptoRequest.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.practiceEvent.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.timeEntry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.employee.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
