import { PayType, PtoStatus, PtoType, ShiftStatus } from '@prisma/client';
import { fakeSettings } from '../settings/practice-settings.test-double';
import { OvertimeService } from './overtime.service';
import { ShiftPlanningService } from './shift-planning.service';

/**
 * Copying a week, repeating a shift and topping up regular shifts used to
 * check and write each new shift on its own: a read for a clash, a read for
 * leave, then a write, about three database calls a shift, one after another
 * (450 or so for a 150-shift week). They are now checked together, from one
 * read of the shifts already there and one of the approved leave, and written
 * in one go (maintenance pass, October 2026).
 *
 * The answer must be exactly what one at a time gave, including a new shift
 * standing in the way of a later one in the same batch. This builds a small
 * practice in a fake database that answers both ways of asking, runs the same
 * request through the old one-at-a-time steps (kept below, as they were) and
 * through the service as it is now, and compares everything that comes out:
 * the result, the rows written and their order, and who was told what.
 */

const NJ = 'America/New_York';
const at = (value: string) => new Date(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const LOCATIONS = [
  { id: 'loc-nb', name: 'North Bergen', slug: 'nb', timezone: NJ, isActive: true },
  { id: 'loc-wny', name: 'West New York', slug: 'wny', timezone: NJ, isActive: true },
];

/// Twenty-four people, mostly hourly, all at North Bergen; some at both.
const PEOPLE = Array.from({ length: 24 }, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    id: `emp-${n}`,
    firstName: `First${n}`,
    lastName: `Last${n}`,
    preferredName: index % 5 === 0 ? `Pref${n}` : null,
    payType: index % 6 === 5 ? PayType.SALARY : PayType.HOURLY,
    locations: index % 4 === 0 ? ['loc-nb', 'loc-wny'] : ['loc-nb'],
  };
});

type Row = {
  id: string;
  employeeId: string | null;
  locationId: string;
  jobRoleId: string | null;
  isRemote: boolean;
  startsAt: Date;
  endsAt: Date;
  status: ShiftStatus;
  notes: string | null;
  createdById: string | null;
  seriesId: string | null;
};

const shiftRow = (over: Partial<Row> & Pick<Row, 'startsAt' | 'endsAt'>): Omit<Row, 'id'> => ({
  employeeId: null,
  locationId: 'loc-nb',
  jobRoleId: null,
  isRemote: false,
  status: ShiftStatus.PUBLISHED,
  notes: null,
  createdById: 'mgr-1',
  seriesId: null,
  ...over,
});

/// The week copied: Sunday 1 November 2026 (the clocks go back that night)
/// to Saturday the 7th, at North Bergen. Each person Monday to Saturday, in
/// three patterns of hours, plus open shifts, an overnight shift and a person
/// down twice on one afternoon, so the second copy clashes with the first.
function sourceWeek(): Omit<Row, 'id'>[] {
  const rows: Omit<Row, 'id'>[] = [];
  const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  PEOPLE.forEach((person, index) => {
    const hours = [
      ['T14:00:00Z', 'T22:00:00Z'],
      ['T13:00:00Z', 'T21:00:00Z'],
      ['T17:00:00Z', 'T25:00:00Z'],
    ][index % 3];
    for (const date of [...dates, '2026-11-07']) {
      const start = at(`${date}${hours[0]}`);
      const end =
        hours[1] === 'T25:00:00Z'
          ? new Date(at(`${date}T00:00:00Z`).getTime() + 25 * 3_600_000)
          : at(`${date}${hours[1]}`);
      rows.push(
        shiftRow({
          employeeId: person.id,
          startsAt: start,
          endsAt: end,
          jobRoleId: index % 2 === 0 ? 'role-fd' : 'role-ma',
          notes: index === 3 ? 'Upstairs' : null,
          isRemote: index === 7 && date === '2026-11-04',
          status: index === 9 && date === '2026-11-06' ? ShiftStatus.DRAFT : ShiftStatus.PUBLISHED,
        }),
      );
    }
  });
  // Overnight, Friday into Saturday.
  rows.push(
    shiftRow({
      employeeId: 'emp-24',
      startsAt: at('2026-11-07T03:00:00Z'),
      endsAt: at('2026-11-07T11:00:00Z'),
    }),
  );
  // Down twice on Tuesday afternoon: the copy of the second clashes with the
  // copy of the first, which only exists because the batch made it.
  rows.push(
    shiftRow({
      employeeId: 'emp-03',
      startsAt: at('2026-11-03T20:00:00Z'),
      endsAt: at('2026-11-03T23:30:00Z'),
    }),
  );
  // Open shifts, Monday to Thursday, one with a job role.
  for (const date of dates.slice(0, 4)) {
    rows.push(
      shiftRow({
        startsAt: at(`${date}T12:00:00Z`),
        endsAt: at(`${date}T20:00:00Z`),
        jobRoleId: date === '2026-11-03' ? 'role-fd' : null,
      }),
    );
  }
  // Cancelled in the source week: never copied.
  rows.push(
    shiftRow({
      employeeId: 'emp-02',
      startsAt: at('2026-11-07T14:00:00Z'),
      endsAt: at('2026-11-07T18:00:00Z'),
      status: ShiftStatus.CANCELLED,
    }),
  );
  return rows;
}

/// What is already in the week copied onto, Sunday 8 to Saturday 14 November.
function targetWeek(): Omit<Row, 'id'>[] {
  return [
    // At the other office, overlapping Wednesday: a clash.
    shiftRow({
      employeeId: 'emp-05',
      locationId: 'loc-wny',
      startsAt: at('2026-11-11T15:00:00Z'),
      endsAt: at('2026-11-11T18:00:00Z'),
    }),
    // A cancelled one in the way of nothing.
    shiftRow({
      employeeId: 'emp-06',
      startsAt: at('2026-11-12T13:00:00Z'),
      endsAt: at('2026-11-12T22:00:00Z'),
      status: ShiftStatus.CANCELLED,
    }),
    // Ending the moment the copy starts: not a clash.
    shiftRow({
      employeeId: 'emp-07',
      startsAt: at('2026-11-13T10:00:00Z'),
      endsAt: at('2026-11-13T14:00:00Z'),
    }),
    // A draft overlapping Monday: a clash all the same.
    shiftRow({
      employeeId: 'emp-13',
      startsAt: at('2026-11-09T20:00:00Z'),
      endsAt: at('2026-11-09T23:00:00Z'),
      status: ShiftStatus.DRAFT,
    }),
    // Saturday morning, under the overnight copy.
    shiftRow({
      employeeId: 'emp-24',
      startsAt: at('2026-11-14T10:00:00Z'),
      endsAt: at('2026-11-14T12:00:00Z'),
    }),
  ];
}

const leave = (employeeId: string, type: PtoType, status: PtoStatus, from: string, to: string) => ({
  employeeId,
  type,
  status,
  startDate: day(from),
  endDate: day(to),
});

const LEAVE = [
  leave('emp-08', PtoType.VACATION, PtoStatus.APPROVED, '2026-11-09', '2026-11-11'),
  leave('emp-09', PtoType.SICK, PtoStatus.APPROVED, '2026-11-13', '2026-11-13'),
  leave('emp-10', PtoType.VACATION, PtoStatus.PENDING, '2026-11-12', '2026-11-12'),
  leave('emp-11', PtoType.VACATION, PtoStatus.DENIED, '2026-11-09', '2026-11-14'),
  leave('emp-12', PtoType.VACATION, PtoStatus.APPROVED, '2026-11-02', '2026-11-06'),
  leave('emp-14', PtoType.UNPAID, PtoStatus.APPROVED, '2026-11-14', '2026-11-20'),
  // For the repeat: away a week in December.
  leave('emp-08', PtoType.SICK, PtoStatus.APPROVED, '2026-12-07', '2026-12-11'),
];

// ---------------------------------------------------------------------------
// The fake database: just enough of Prisma's `where` for these reads.

type Where = Record<string, unknown> | undefined;

const isIn = (value: unknown, rule: unknown) =>
  rule === undefined ||
  (rule !== null && typeof rule === 'object' && 'in' in (rule as object)
    ? ((rule as { in: unknown[] }).in ?? []).includes(value)
    : rule !== null && typeof rule === 'object' && 'not' in (rule as object)
      ? value !== (rule as { not: unknown }).not
      : value === rule);

function inRange(value: Date, rule: unknown) {
  if (rule === undefined) return true;
  const r = rule as { gte?: Date; gt?: Date; lte?: Date; lt?: Date };
  return (
    (r.gte === undefined || value >= r.gte) &&
    (r.gt === undefined || value > r.gt) &&
    (r.lte === undefined || value <= r.lte) &&
    (r.lt === undefined || value < r.lt)
  );
}

function fakeDatabase(existing: Omit<Row, 'id'>[]) {
  const shifts: Row[] = existing.map((row, index) => ({ id: `old-${index}`, ...row }));
  let made = 0;
  const people = new Map(PEOPLE.map((person) => [person.id, person]));
  const places = new Map(LOCATIONS.map((location) => [location.id, location]));

  const matches = (row: Row, where: Where = {}) => {
    const employee = row.employeeId ? people.get(row.employeeId) : undefined;
    const payType = (where.employee as { payType?: PayType } | undefined)?.payType;
    return (
      isIn(row.id, where.id) &&
      isIn(row.employeeId, where.employeeId) &&
      isIn(row.locationId, where.locationId) &&
      isIn(row.seriesId, where.seriesId) &&
      isIn(row.status, where.status) &&
      inRange(row.startsAt, where.startsAt) &&
      inRange(row.endsAt, where.endsAt) &&
      (payType === undefined || employee?.payType === payType)
    );
  };
  const withRelations = (row: Row) => {
    const person = row.employeeId ? people.get(row.employeeId) : undefined;
    return {
      ...row,
      location: places.get(row.locationId),
      employee: person
        ? {
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            preferredName: person.preferredName,
          }
        : null,
      jobRole: row.jobRoleId ? { id: row.jobRoleId, name: row.jobRoleId } : null,
    };
  };
  const write = (data: Omit<Row, 'id'>) => {
    made += 1;
    const row = { id: `new-${made}`, ...data, notes: data.notes ?? null } as Row;
    shifts.push(row);
    return row;
  };

  const prisma = {
    shift: {
      findMany: jest.fn(async ({ where, orderBy }: { where?: Where; orderBy?: unknown }) => {
        const found = shifts.filter((row) => matches(row, where)).map(withRelations);
        return orderBy ? found.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) : found;
      }),
      findFirst: jest.fn(async ({ where }: { where?: Where }) => {
        const found = shifts.find((row) => matches(row, where));
        return found ? { id: found.id } : null;
      }),
      create: jest.fn(async ({ data }: { data: Omit<Row, 'id'> }) => write(data)),
      createMany: jest.fn(async ({ data }: { data: Omit<Row, 'id'>[] }) => {
        data.forEach(write);
        return { count: data.length };
      }),
    },
    ptoRequest: {
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        LEAVE.filter((request) => leaveMatches(request, where)),
      ),
      findFirst: jest.fn(
        async ({ where }: { where: Where }) =>
          LEAVE.find((request) => leaveMatches(request, where)) ?? null,
      ),
    },
    location: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => places.get(where.id)),
    },
    employeeLocation: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { employeeId_locationId: { employeeId: string; locationId: string } };
        }) => {
          const { employeeId, locationId } = where.employeeId_locationId;
          return people.get(employeeId)?.locations.includes(locationId) ? { employeeId } : null;
        },
      ),
    },
    employee: { count: jest.fn(async () => 0) },
    employeeJobRole: {
      findMany: jest.fn(async () => [{ jobRole: { id: 'role-fd', name: 'Front Desk' } }]),
    },
    jobRole: { findUnique: jest.fn(async () => ({ id: 'role-fd', name: 'Front Desk' })) },
    shiftSeries: {
      create: jest.fn(async () => ({ id: 'series-new' })),
      findMany: jest.fn(async () => [] as unknown[]),
      update: jest.fn(async () => ({})),
    },
  };
  const calls = () =>
    Object.values(prisma)
      .flatMap((model) => Object.values(model))
      .reduce((sum, method) => sum + (method as jest.Mock).mock.calls.length, 0);
  return { prisma, shifts, calls };
}

/// A row as written, without the id the database gave it.
function withoutId(row: Row): Omit<Row, 'id'> {
  const copy: Partial<Row> = { ...row };
  delete copy.id;
  return copy as Omit<Row, 'id'>;
}

function leaveMatches(request: (typeof LEAVE)[number], where: Where = {}) {
  return (
    isIn(request.employeeId, where.employeeId) &&
    isIn(request.status, where.status) &&
    inRange(request.startDate, where.startDate) &&
    inRange(request.endDate, where.endDate)
  );
}

// ---------------------------------------------------------------------------
// The way it was done before: one shift at a time, three calls each.

type Planned = {
  date: string;
  startsAt: Date;
  endsAt: Date;
  employeeId: string | null;
  jobRoleId: string | null;
  isRemote: boolean;
  openCount: number;
  locationId: string;
  status: ShiftStatus;
  notes?: string;
  createdById: string | null;
  seriesId?: string | null;
};

type Prisma = ReturnType<typeof fakeDatabase>['prisma'];

async function oneAtATime(prisma: Prisma, planned: Planned[]) {
  const skipped: { date: string; reason: string; detail: string }[] = [];
  const dates: string[] = [];
  const made: number[] = [];
  let created = 0;

  for (const candidate of planned) {
    if (!candidate.employeeId) {
      await prisma.shift.createMany({
        data: Array.from({ length: candidate.openCount }, () => ({
          employeeId: null,
          jobRoleId: candidate.jobRoleId,
          isRemote: candidate.isRemote,
          locationId: candidate.locationId,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          status: candidate.status,
          notes: candidate.notes ?? null,
          createdById: candidate.createdById,
          seriesId: candidate.seriesId ?? null,
        })),
      });
      created += candidate.openCount;
      made.push(candidate.openCount);
      dates.push(candidate.date);
      continue;
    }

    const clash = await prisma.shift.findFirst({
      where: {
        employeeId: candidate.employeeId,
        status: { not: ShiftStatus.CANCELLED },
        startsAt: { lt: candidate.endsAt },
        endsAt: { gt: candidate.startsAt },
      },
    });
    if (clash) {
      skipped.push({
        date: candidate.date,
        reason: 'OVERLAPS_SHIFT',
        detail: 'Already has a shift at that time',
      });
      made.push(0);
      continue;
    }

    const onLeave = await prisma.ptoRequest.findFirst({
      where: {
        employeeId: candidate.employeeId,
        status: PtoStatus.APPROVED,
        startDate: { lte: day(candidate.date) },
        endDate: { gte: day(candidate.date) },
      },
    });
    if (onLeave) {
      skipped.push({
        date: candidate.date,
        reason: 'ON_APPROVED_LEAVE',
        detail: `On approved ${onLeave.type.toLowerCase()} leave`,
      });
      made.push(0);
      continue;
    }

    await prisma.shift.create({
      data: {
        employeeId: candidate.employeeId,
        jobRoleId: candidate.jobRoleId,
        isRemote: candidate.isRemote,
        locationId: candidate.locationId,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        status: candidate.status,
        notes: candidate.notes ?? null,
        createdById: candidate.createdById,
        seriesId: candidate.seriesId ?? null,
      },
    });
    created += 1;
    made.push(1);
    dates.push(candidate.date);
  }
  return { created, skipped, dates, made };
}

// ---------------------------------------------------------------------------

function build(existing: Omit<Row, 'id'>[], way: 'batched' | 'oneAtATime') {
  const database = fakeDatabase(existing);
  const inbox = { notify: jest.fn() };
  const overtime = {
    snapshot: jest.fn().mockResolvedValue(new Map()),
    announceNewOvertime: jest.fn(),
  };
  const service = new ShiftPlanningService(
    database.prisma as never,
    fakeSettings(),
    overtime as unknown as OvertimeService,
    inbox as never,
  );
  if (way === 'oneAtATime') {
    Object.assign(service, {
      createPlanned: (planned: Planned[]) => oneAtATime(database.prisma, planned),
    });
  }
  return { service, inbox, overtime, ...database };
}

/// Runs the same thing both ways, from the same starting rows, and checks
/// every outcome matches. Returns the calls each way made.
async function bothWays(
  existing: Omit<Row, 'id'>[],
  run: (service: ShiftPlanningService, prisma: Prisma) => Promise<unknown>,
) {
  const before = build(existing, 'oneAtATime');
  const now = build(existing, 'batched');
  const startCalls = [before.calls(), now.calls()];
  const expected = await run(before.service, before.prisma);
  const callsBefore = before.calls() - startCalls[0];
  const actual = await run(now.service, now.prisma);
  const callsNow = now.calls() - startCalls[1];

  expect(actual).toEqual(expected);
  // The same rows, written in the same order, with the same values.
  const written = (rows: Row[]) => rows.map(withoutId);
  expect(written(now.shifts)).toEqual(written(before.shifts));
  expect(now.inbox.notify.mock.calls).toEqual(before.inbox.notify.mock.calls);
  expect(now.overtime.snapshot.mock.calls).toEqual(before.overtime.snapshot.mock.calls);
  expect(now.overtime.announceNewOvertime.mock.calls).toEqual(
    before.overtime.announceNewOvertime.mock.calls,
  );
  return { callsBefore, callsNow, result: actual, shifts: now.shifts };
}

describe('planning shifts in one go gives what one at a time gave', () => {
  const week = [...sourceWeek(), ...targetWeek()];
  const copy = (over: Record<string, unknown> = {}) => ({
    locationId: 'loc-nb',
    fromWeekStart: '2026-11-01',
    toWeekStart: '2026-11-08',
    ...over,
  });

  it('copies a 150-shift week, published, with clashes, leave and open shifts', async () => {
    const source = sourceWeek().filter((row) => row.status !== ShiftStatus.CANCELLED);
    expect(source).toHaveLength(150);

    const { callsBefore, callsNow, result } = await bothWays(week, (service) =>
      service.copyWeek(copy({ status: ShiftStatus.PUBLISHED }), 'mgr-1'),
    );

    // The case is a real test: something of each kind happened.
    const outcome = result as {
      created: number;
      skipped: { date: string; reason: string }[];
    };
    const reasons = outcome.skipped.map((skip) => skip.reason);
    expect(reasons).toContain('OVERLAPS_SHIFT');
    expect(reasons).toContain('ON_APPROVED_LEAVE');
    expect(outcome.skipped).toContainEqual(
      expect.objectContaining({ date: '2026-11-10', reason: 'OVERLAPS_SHIFT' }),
    );
    expect(outcome.created + outcome.skipped.length).toBe(150);

    // The source read, one read each for shifts and leave, one write, and
    // the overtime read after: five, where one at a time took over 400.
    expect(callsNow).toBe(5);
    expect(callsBefore).toBeGreaterThan(400);
  });

  it('copies as drafts, and for chosen people only', async () => {
    await bothWays(week, (service) => service.copyWeek(copy(), 'mgr-1'));
    await bothWays(week, (service) =>
      service.copyWeek(copy({ employeeIds: ['emp-03', 'emp-05', 'emp-08', 'emp-24'] }), 'mgr-1'),
    );
  });

  it('copies as cancelled, where nothing copied stands in the way of the next', async () => {
    await bothWays(week, (service) =>
      service.copyWeek(copy({ status: ShiftStatus.CANCELLED }), 'mgr-1'),
    );
  });

  it('copies backwards over a week already copied', async () => {
    const { shifts } = await bothWays(week, (service) =>
      service.copyWeek(copy({ status: ShiftStatus.PUBLISHED }), 'mgr-1'),
    );
    const already = shifts.map(withoutId);
    await bothWays(already, (service) =>
      service.copyWeek(copy({ fromWeekStart: '2026-11-08', toWeekStart: '2026-11-01' }), 'mgr-1'),
    );
  });

  it('repeats a shift for two months over leave and shifts already there', async () => {
    const existing = [
      ...week,
      shiftRow({
        employeeId: 'emp-08',
        locationId: 'loc-wny',
        startsAt: at('2026-11-18T19:00:00Z'),
        endsAt: at('2026-11-18T21:00:00Z'),
      }),
    ];
    const { callsBefore, callsNow } = await bothWays(existing, (service) =>
      service.repeat(
        {
          employeeId: 'emp-08',
          locationId: 'loc-nb',
          startTime: '09:00',
          endTime: '17:00',
          daysOfWeek: [1, 3, 5],
          from: '2026-11-01',
          until: '2026-12-31',
          status: ShiftStatus.PUBLISHED,
        },
        'mgr-1',
      ),
    );
    expect(callsNow).toBeLessThan(callsBefore);
  });

  it('repeats open shifts, two a day, and a regular shift with no end date', async () => {
    await bothWays(week, (service) =>
      service.repeat(
        {
          locationId: 'loc-nb',
          jobRoleId: 'role-fd',
          startTime: '08:00',
          endTime: '16:00',
          daysOfWeek: [2, 4],
          from: '2026-11-01',
          until: '2026-12-31',
          openCount: 2,
        },
        'mgr-1',
      ),
    );
    await bothWays(week, (service) =>
      service.repeat(
        {
          employeeId: 'emp-09',
          locationId: 'loc-nb',
          startTime: '12:00',
          endTime: '20:00',
          daysOfWeek: [5],
          from: '2026-11-01',
          status: ShiftStatus.PUBLISHED,
        },
        'mgr-1',
        at('2026-10-30T15:00:00Z'),
      ),
    );
  });

  it('tops up regular shifts the same way', async () => {
    const series = (over: Record<string, unknown>) => ({
      id: 'series-x',
      employeeId: 'emp-13',
      locationId: 'loc-nb',
      jobRoleId: 'role-fd',
      isRemote: false,
      openCount: 1,
      daysOfWeek: [1, 2],
      everyWeeks: 1,
      weeksOfMonth: [],
      cycleFrom: null,
      startTime: '15:00',
      endTime: '19:00',
      status: ShiftStatus.PUBLISHED,
      notes: null,
      startsOn: day('2026-10-01'),
      endsOn: null,
      filledThrough: day('2026-11-01'),
      createdById: 'mgr-1',
      location: { timezone: NJ, isActive: true },
      employee: { employmentStatus: 'ACTIVE', locations: [{ locationId: 'loc-nb' }] },
      ...over,
    });
    await bothWays(week, async (service, prisma) => {
      prisma.shiftSeries.findMany.mockResolvedValue([
        series({}),
        series({ id: 'series-open', employeeId: null, employee: null, openCount: 3 }),
        series({ id: 'series-14', employeeId: 'emp-14', daysOfWeek: [6] }),
      ]);
      return service.extendStandingShifts(at('2026-11-05T15:00:00Z'));
    });
  });
});
