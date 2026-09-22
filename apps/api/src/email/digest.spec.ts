import { AttentionService } from './attention.service';
import { DigestService } from './digest.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function build(
  data: {
    credentials?: unknown[];
    tasks?: unknown[];
    punches?: unknown[];
    timeOff?: unknown[];
    managers?: unknown[];
    kiosks?: unknown[];
    unapproved?: unknown[];
    leaverShifts?: unknown[];
    locations?: unknown[];
    staff?: { id: string; firstName: string; lastName: string }[];
  } = {},
) {
  const managers = data.managers ?? [
    { email: 'morgan@domihealthcare.com', firstName: 'Morgan' },
    { email: 'ada@domihealthcare.com', firstName: 'Ada' },
  ];

  const prisma = {
    employeeCredential: { findMany: jest.fn().mockResolvedValue(data.credentials ?? []) },
    employeeChecklistTask: { findMany: jest.fn().mockResolvedValue(data.tasks ?? []) },
    timeEntry: {
      findMany: jest.fn().mockResolvedValue(data.punches ?? []),
      groupBy: jest.fn().mockResolvedValue(data.unapproved ?? []),
    },
    ptoRequest: { findMany: jest.fn().mockResolvedValue(data.timeOff ?? []) },
    kioskDevice: { findMany: jest.fn().mockResolvedValue(data.kiosks ?? []) },
    shift: { findMany: jest.fn().mockResolvedValue(data.leaverShifts ?? []) },
    location: { findMany: jest.fn().mockResolvedValue(data.locations ?? []) },
    employee: {
      // Two different questions go through this one method: who should be
      // emailed, and what a handful of employee ids are called. Answering both
      // with the same list is how a test passes for the wrong reason.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: jest.fn(async (args: any) =>
        args?.where?.id?.in ? (data.staff ?? []) : managers,
      ),
    },
  };
  const notifications = { dailyDigest: jest.fn() };

  const attention = new AttentionService(prisma as never);

  return {
    // `service` sends; `attention` decides what there is to send. Tests about
    // the content go through the second, tests about delivery through the first.
    service: new DigestService(prisma as never, notifications as never, attention),
    attention,
    prisma,
    notifications,
  };
}

const frankie = { firstName: 'Frankie', lastName: 'Front-Desk' };

describe('DigestService', () => {
  it('says nothing at all when there is nothing to chase', async () => {
    // A daily email that is usually empty gets filtered into a folder within a
    // fortnight, and then the one that matters goes there too.
    const { service, notifications } = build();
    await expect(service.send()).resolves.toMatchObject({ sent: 0 });
    expect(notifications.dailyDigest).not.toHaveBeenCalled();
  });

  it('tells every manager once there is something', async () => {
    const { service, notifications } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie }],
    });

    await expect(service.send()).resolves.toMatchObject({ sent: 2 });
    expect(notifications.dailyDigest.mock.calls.map((call) => call[0])).toEqual([
      'morgan@domihealthcare.com',
      'ada@domihealthcare.com',
    ]);
  });

  it('separates credentials that have lapsed from ones about to', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const nextMonth = new Date(Date.now() + 30 * 86_400_000);

    const { attention } = build({
      credentials: [
        { name: 'NJ RN licence', expiresOn: yesterday, employee: frankie },
        { name: 'BLS card', expiresOn: nextMonth, employee: frankie },
      ],
    });

    const contents = await attention.gather();
    expect(contents.expiredCredentials).toHaveLength(1);
    expect(contents.expiredCredentials[0]).toMatch(/NJ RN licence, expired/);
    expect(contents.expiringCredentials).toHaveLength(1);
    expect(contents.expiringCredentials[0]).toMatch(/BLS card, expires/);
  });

  it('names the person and what it is, so the email can be acted on without opening the app', async () => {
    const { attention } = build({
      punches: [{ clockInAt: day('2026-09-15'), employee: frankie }],
      tasks: [{ title: 'Form I-9', dueAt: day('2026-09-10'), checklist: { employee: frankie } }],
    });

    const contents = await attention.gather();
    expect(contents.missingPunches[0]).toBe(
      'Frankie Front-Desk — clocked in Sep 15, 2026 and never out',
    );
    expect(contents.overdueTasks[0]).toBe('Frankie Front-Desk — Form I-9, due Sep 10, 2026');
  });

  it('renders a single-day request without a pointless range', async () => {
    const { attention } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie }],
    });

    const contents = await attention.gather();
    expect(contents.undecidedTimeOff[0]).toBe('Frankie Front-Desk — Nov 3, 2026');
  });

  it('renders a range when it is one', async () => {
    const { attention } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-07'), employee: frankie }],
    });

    const contents = await attention.gather();
    expect(contents.undecidedTimeOff[0]).toBe('Frankie Front-Desk — Nov 3, 2026 to Nov 7, 2026');
  });

  it('leaves people who have left out of it', async () => {
    const { attention, prisma } = build();
    await attention.gather();

    for (const call of [
      prisma.employeeCredential.findMany.mock.calls[0][0],
      prisma.employeeChecklistTask.findMany.mock.calls[0][0],
    ]) {
      expect(JSON.stringify(call.where)).toContain('TERMINATED');
    }
  });

  it('only chases managers and admins', async () => {
    const { service, prisma } = build({
      timeOff: [{ startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie }],
    });
    await service.send();

    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.role.in).toEqual(['MANAGER', 'ADMIN']);
    expect(where.employmentStatus).toBe('ACTIVE');
  });
});

/**
 * The four operational reminders.
 *
 * Time is pinned for all of these. The rota check only speaks when the coming
 * Monday is close, so left to the real clock these tests would pass on a Friday
 * and fail on a Tuesday — which is worse than not having them.
 */
describe('DigestService — who gets it', () => {
  it('only emails managers who have not turned it off', async () => {
    const { service, prisma } = build({
      credentials: [{ name: 'BLS card', expiresOn: day('2026-01-01'), employee: frankie }],
    });
    await service.send();

    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.wantsDailyDigest).toBe(true);
  });

  it('sends nothing when everybody has opted out, and says so', async () => {
    // Not an error, and not a reason to email somebody anyway. Everything in
    // the digest is also on the screen it belongs to.
    const { service, notifications } = build({
      credentials: [{ name: 'BLS card', expiresOn: day('2026-01-01'), employee: frankie }],
      managers: [],
    });

    await expect(service.send()).resolves.toMatchObject({ sent: 0 });
    expect(notifications.dailyDigest).not.toHaveBeenCalled();
  });
});

describe('DigestService — what is going wrong at the office', () => {
  afterEach(() => jest.useRealTimers());

  /// Thursday 24 September 2026. Four days before Monday the 28th, which is
  /// exactly the edge of the rota warning.
  const onThursday = () => jest.useFakeTimers().setSystemTime(day('2026-09-24'));

  describe('kiosk tablets', () => {
    it('names a tablet that has gone quiet, and when it was last used', async () => {
      onThursday();
      const { attention } = build({
        kiosks: [
          {
            name: 'Front desk',
            pairedAt: day('2026-01-04'),
            lastSeenAt: day('2026-09-20'),
            location: { name: 'North Bergen' },
          },
        ],
      });

      const { silentKiosks } = await attention.gather();
      expect(silentKiosks).toEqual([
        'North Bergen — the Front desk tablet was last used Sep 20, 2026',
      ]);
    });

    it('tells a never-used tablet apart from a tablet that has stopped', async () => {
      // A tablet paired last week and never opened is a setup that was not
      // finished. One that worked until Tuesday is a tablet that has broken.
      onThursday();
      const { attention } = build({
        kiosks: [
          {
            name: 'Front desk',
            pairedAt: day('2026-09-18'),
            lastSeenAt: null,
            location: { name: 'West New York' },
          },
        ],
      });

      const { silentKiosks } = await attention.gather();
      expect(silentKiosks[0]).toBe(
        'West New York — the Front desk tablet has not been used since it was paired on Sep 18, 2026',
      );
    });

    it('asks only about paired, unrevoked tablets at a live kiosk location', async () => {
      onThursday();
      const { attention, prisma } = build();
      await attention.gather();

      const where = prisma.kioskDevice.findMany.mock.calls[0][0].where;
      expect(where.pairedAt).toEqual({ not: null });
      expect(where.revokedAt).toBeNull();
      expect(where.location).toEqual({ isActive: true, kioskEnabled: true });

      // A day of silence, not an hour: an overnight router reboot is not news.
      const cutoff = where.OR[1].lastSeenAt.lt;
      expect((Date.now() - cutoff.getTime()) / 3_600_000).toBeCloseTo(24, 1);
    });
  });

  describe('next week not published', () => {
    const northBergen = (shifts: { status: string }[]) => ({ name: 'North Bergen', shifts });

    it('says nothing until the week is close', async () => {
      // Monday the 21st: the coming Monday is a week away, and complaining
      // about it every night for seven nights is how an email gets filtered.
      jest.useFakeTimers().setSystemTime(day('2026-09-21'));
      const { attention, prisma } = build({ locations: [northBergen([])] });

      expect((await attention.gather()).unpublishedRota).toEqual([]);
      // Not just filtered out afterwards — never asked for.
      expect(prisma.location.findMany).not.toHaveBeenCalled();
    });

    it('speaks four days out, and says how long is left', async () => {
      onThursday();
      const { attention } = build({ locations: [northBergen([])] });

      expect((await attention.gather()).unpublishedRota).toEqual([
        'North Bergen — nothing scheduled for the week of Sep 28, 2026, starting in 4 days',
      ]);
    });

    it('counts a drafted week as unpublished, but says it differently', async () => {
      // Staff cannot see a draft, so to them it is an empty week. But "you have
      // written it, you just have not published it" is a much shorter
      // conversation than "nobody is scheduled".
      onThursday();
      const { attention } = build({
        locations: [northBergen([{ status: 'DRAFT' }, { status: 'DRAFT' }])],
      });

      expect((await attention.gather()).unpublishedRota).toEqual([
        'North Bergen — 2 shifts drafted but not published for the week of Sep 28, 2026, starting in 4 days',
      ]);
    });

    it('goes quiet once something is published', async () => {
      onThursday();
      const { attention } = build({
        locations: [northBergen([{ status: 'DRAFT' }, { status: 'PUBLISHED' }])],
      });

      expect((await attention.gather()).unpublishedRota).toEqual([]);
    });

    it('only chases locations that are actually rota\'d through the app', async () => {
      // A location scheduled some other way should not complain every night
      // forever, so the query requires recent published shifts.
      onThursday();
      const { attention, prisma } = build({ locations: [] });
      await attention.gather();

      const where = prisma.location.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where.shifts.some.status).toBe('PUBLISHED');
      const since = where.shifts.some.startsAt.gte;
      expect((day('2026-09-24').getTime() - since.getTime()) / 86_400_000).toBe(28);
    });
  });

  describe('hours not approved', () => {
    it('gives one line per person, not one per shift', async () => {
      onThursday();
      const { attention } = build({
        unapproved: [
          { employeeId: 'emp-1', _count: { _all: 6 }, _min: { clockInAt: day('2026-09-08') } },
        ],
        staff: [{ id: 'emp-1', firstName: 'Frankie', lastName: 'Front-Desk' }],
      });

      expect((await attention.gather()).unapprovedHours).toEqual([
        'Frankie Front-Desk — 6 shifts not approved, oldest Sep 8, 2026',
      ]);
    });

    it('puts the oldest first, since those are closest to missing a pay run', async () => {
      onThursday();
      const { attention } = build({
        unapproved: [
          { employeeId: 'emp-2', _count: { _all: 1 }, _min: { clockInAt: day('2026-09-14') } },
          { employeeId: 'emp-1', _count: { _all: 2 }, _min: { clockInAt: day('2026-09-02') } },
        ],
        staff: [
          { id: 'emp-1', firstName: 'Frankie', lastName: 'Front-Desk' },
          { id: 'emp-2', firstName: 'Max', lastName: 'Medical' },
        ],
      });

      const { unapprovedHours } = await attention.gather();
      expect(unapprovedHours[0]).toMatch(/Frankie/);
      expect(unapprovedHours[1]).toMatch(/Max/);
    });

    it('leaves alone anything from the last week', async () => {
      onThursday();
      const { attention, prisma } = build();
      await attention.gather();

      const where = prisma.timeEntry.groupBy.mock.calls[0][0].where;
      expect(where.status).toBe('COMPLETED');
      expect(where.clockOutAt).toEqual({ not: null });
      expect((day('2026-09-24').getTime() - where.clockInAt.lt.getTime()) / 86_400_000).toBe(7);
    });
  });

  describe('shifts for people who have left', () => {
    it('groups them by person and gives the first date', async () => {
      onThursday();
      const { attention } = build({
        leaverShifts: [
          { startsAt: day('2026-09-28'), employee: { firstName: 'Max', lastName: 'Medical' } },
          { startsAt: day('2026-09-29'), employee: { firstName: 'Max', lastName: 'Medical' } },
        ],
      });

      expect((await attention.gather()).shiftsForLeavers).toEqual([
        'Max Medical — 2 shifts from Sep 28, 2026, but marked as no longer employed',
      ]);
    });

    it('looks forward only — a shift they actually worked is not a mistake', async () => {
      onThursday();
      const { attention, prisma } = build();
      await attention.gather();

      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where.startsAt.gte).toEqual(day('2026-09-24'));
      expect(where.employee).toEqual({ employmentStatus: 'TERMINATED' });
      expect(where.status).toEqual({ not: 'CANCELLED' });
    });
  });
});

