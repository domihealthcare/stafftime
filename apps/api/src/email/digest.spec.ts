import { fakeSettings } from '../settings/practice-settings.test-double';
import { AttentionService } from './attention.service';
import { DigestService } from './digest.service';
import { DIGEST_TOPICS, contentsFor } from './digest-topics';

/// Midday UTC — morning in New Jersey — so a date means the same day on the server's
/// clock and at the practice, as real punches and the 5am round-up do.
const day = (value: string) => new Date(`${value}T12:00:00.000Z`);
/// A date-only value, as the round-up's "today" is: midnight UTC of the date.
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function build(
  data: {
    credentials?: unknown[];
    tasks?: unknown[];
    punches?: unknown[];
    handEntries?: unknown[];
    patternPunches?: unknown[];
    teams?: unknown[];
    timeOff?: unknown[];
    managers?: unknown[];
    kiosks?: unknown[];
    unapproved?: unknown[];
    leaverShifts?: unknown[];
    missedShifts?: unknown[];
    openShifts?: unknown[];
    closures?: unknown[];
    closureShifts?: unknown[];
    closingRecords?: unknown[];
    supplies?: unknown[];
    /// The days the suggestions not yet dealt with arrived, oldest first.
    suggestions?: Date[];
    locations?: unknown[];
    staff?: { id: string; firstName: string; lastName: string }[];
    /// People with the job roles and credentials the license standing reads.
    standing?: unknown[];
    settings?: { rotaWarningDays?: number; overtimeThresholdHours?: number };
    /// Published shifts at a quiet time clock's office since it was last seen.
    shiftsMissed?: number;
  } = {},
) {
  const managers = data.managers ?? [
    { email: 'morgan@domihealthcare.com', firstName: 'Morgan', mutedDigestTopics: [] },
    { email: 'ada@domihealthcare.com', firstName: 'Ada', mutedDigestTopics: [] },
  ];

  const prisma = {
    employeeCredential: { findMany: jest.fn().mockResolvedValue(data.credentials ?? []) },
    employeeChecklistTask: { findMany: jest.fn().mockResolvedValue(data.tasks ?? []) },
    timeEntry: {
      // Three questions of this table: punches with no clock-out, hours
      // entered by hand — the one that asks about `enteredByHandAt` — and the
      // last four weeks' punches for patterns, the one that asks about lateness.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: jest.fn(async (args: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args.where.OR?.some((clause: any) => 'isLate' in clause)
          ? (data.patternPunches ?? [])
          : args.where.enteredByHandAt
            ? (data.handEntries ?? [])
            : (data.punches ?? []),
      ),
      groupBy: jest.fn().mockResolvedValue(data.unapproved ?? []),
    },
    ptoRequest: { findMany: jest.fn().mockResolvedValue(data.timeOff ?? []) },
    kioskDevice: { findMany: jest.fn().mockResolvedValue(data.kiosks ?? []) },
    // Several questions of the same table: the open-shift one is the one
    // that asks for nobody; shifts with no clock-in ask for ones already over; the time-off clashes ask about any shift, for
    // which weekend days an office is open.
    shift: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: jest.fn(async (args: any) =>
        args.where.OR
          ? (data.closureShifts ?? [])
          : args.where.employeeId === null
            ? (data.openShifts ?? [])
            : args.where.endsAt?.lte
              ? (data.missedShifts ?? [])
              : args.where.employee
                ? (data.leaverShifts ?? [])
                : [],
      ),
      count: jest.fn().mockResolvedValue(data.shiftsMissed ?? 1),
    },
    location: { findMany: jest.fn().mockResolvedValue(data.locations ?? []) },
    shiftSeries: { findMany: jest.fn().mockResolvedValue([]) },
    practiceSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    practiceEvent: { findMany: jest.fn().mockResolvedValue(data.closures ?? []) },
    closingRecord: { findMany: jest.fn().mockResolvedValue(data.closingRecords ?? []) },
    supplyRequest: { findMany: jest.fn().mockResolvedValue(data.supplies ?? []) },
    feedback: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: data.suggestions?.length ?? 0 },
        _min: { receivedOn: data.suggestions?.[0] ?? null },
      }),
    },
    employee: {
      // Two different questions go through this one method: who should be
      // emailed, and what a handful of employee ids are called. Answering both
      // with the same list is how a test passes for the wrong reason.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: jest.fn(async (args: any) =>
        // Hourly staff, for the overtime forecast: none unless a test says.
        args?.where?.payType
          ? []
          : args?.select?.locations
            ? (data.teams ?? [])
            : args?.select?.jobRoles
              ? (data.standing ?? [])
              : args?.where?.id?.in
                ? (data.staff ?? [])
                : managers,
      ),
    },
  };
  const notifications = { dailyDigest: jest.fn() };

  const attention = new AttentionService(prisma as never, fakeSettings(data.settings));

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
    // A fixed morning, and date-only expiries as the database stores them:
    // "24 hours ago" is still today in New Jersey during the evening, which
    // made this fail every night after 8pm.
    jest.useFakeTimers().setSystemTime(day('2026-09-24'));
    const yesterday = date('2026-09-23');
    const nextMonth = date('2026-10-24');

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
    jest.useRealTimers();
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

  it('lists a punch the app clocked out at midnight as a clock-out to correct', async () => {
    const { attention, prisma } = build({
      punches: [
        {
          // 8:52 AM in New Jersey.
          clockInAt: new Date('2026-10-05T12:52:00.000Z'),
          autoClockedOutAt: new Date('2026-10-06T10:00:00.000Z'),
          employee: frankie,
        },
      ],
    });

    const contents = await attention.gather();
    expect(contents.missingPunches[0]).toBe(
      'Frankie Front-Desk — clocked in 8:52 AM on Oct 5, 2026, clocked out automatically at midnight; correct the time',
    );
    // Until a manager corrects it, however old — but never once approved.
    const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'APPROVED' });
    expect(where.OR).toContainEqual({ autoClockedOutAt: { not: null }, isMissingPunch: true });
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

    // The call that asks who to email, not the one reading license standing.
    const where = prisma.employee.findMany.mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ([args]: any[]) => args?.where?.role,
    )?.[0].where;
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

    // The call that asks who to email, not the one reading license standing.
    const where = prisma.employee.findMany.mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ([args]: any[]) => args?.where?.role,
    )?.[0].where;
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

describe('DigestService — who gets which part', () => {
  const morgan = { email: 'morgan@domihealthcare.com', firstName: 'Morgan' };
  const ada = { email: 'ada@domihealthcare.com', firstName: 'Ada' };
  const lapsed = { name: 'BLS card', expiresOn: day('2026-01-01'), employee: frankie };
  const asked = { startDate: day('2026-11-03'), endDate: day('2026-11-03'), employee: frankie };

  /// What each manager was sent: their email against the sections with lines.
  const received = (notifications: { dailyDigest: jest.Mock }): Record<string, string[]> =>
    Object.fromEntries(
      notifications.dailyDigest.mock.calls.map(([to, , contents]) => [
        to,
        Object.entries(contents as Record<string, string[]>)
          .filter(([, lines]) => lines.length > 0)
          .map(([key]) => key),
      ]),
    );

  it('puts every section in exactly one part', () => {
    const keys = Object.values(DIGEST_TOPICS).flat();
    expect(new Set(keys).size).toBe(keys.length);
    // The keys of the round-up itself, from an empty one.
    const empty = contentsFor(
      Object.fromEntries(keys.map((key) => [key, ['x']])) as never,
      new Set(),
    );
    expect(Object.values(empty).every((lines) => lines.length === 0)).toBe(true);
  });

  it('gives each manager only the parts they look after', async () => {
    const { service, notifications } = build({
      credentials: [lapsed],
      timeOff: [asked],
      managers: [
        { ...morgan, mutedDigestTopics: ['LICENSES'] },
        { ...ada, mutedDigestTopics: ['TIME_OFF'] },
      ],
    });

    await expect(service.send()).resolves.toMatchObject({ sent: 2 });
    expect(received(notifications)).toEqual({
      'morgan@domihealthcare.com': ['undecidedTimeOff'],
      'ada@domihealthcare.com': ['expiredCredentials'],
    });
  });

  it('sends a part nobody looks after to everybody, so nothing is missed', async () => {
    const { service, notifications } = build({
      credentials: [lapsed],
      managers: [
        { ...morgan, mutedDigestTopics: ['LICENSES'] },
        { ...ada, mutedDigestTopics: ['LICENSES', 'TIME_OFF'] },
      ],
    });

    await service.send();
    expect(received(notifications)).toEqual({
      'morgan@domihealthcare.com': ['expiredCredentials'],
      'ada@domihealthcare.com': ['expiredCredentials'],
    });
  });

  it('does not email somebody whose parts have nothing in them tonight', async () => {
    const { service, notifications } = build({
      timeOff: [asked],
      managers: [
        { ...morgan, mutedDigestTopics: ['TIME_OFF'] },
        { ...ada, mutedDigestTopics: [] },
      ],
    });

    await expect(service.send()).resolves.toMatchObject({ sent: 1 });
    expect(Object.keys(received(notifications))).toEqual(['ada@domihealthcare.com']);
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

    it('says nothing about a time clock that was only switched off while nobody was working', async () => {
      // The front-desk computer as the time clock: off from Friday night to
      // Monday morning, a day and a half of silence with nothing wrong.
      onThursday();
      const { attention, prisma } = build({
        kiosks: [
          {
            name: 'Front desk PC',
            pairedAt: day('2026-09-01'),
            lastSeenAt: day('2026-09-20'),
            locationId: 'loc-nb',
            location: { name: 'North Bergen' },
          },
        ],
        shiftsMissed: 0,
      });

      expect((await attention.gather()).silentKiosks).toEqual([]);
      const where = prisma.shift.count.mock.calls[0][0].where;
      expect(where).toMatchObject({
        locationId: 'loc-nb',
        status: 'PUBLISHED',
        startsAt: { gt: day('2026-09-20') },
      });
      // Only shifts that have finished: one under way now has not been missed.
      expect(where.endsAt.lt.getTime()).toBeLessThanOrEqual(Date.now());
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

    it('uses the window the practice set, not a constant', async () => {
      // Monday the 21st is a week from the coming Monday. Silent by default,
      // and not silent for a practice that publishes a fortnight ahead and
      // wants longer to notice.
      jest.useFakeTimers().setSystemTime(day('2026-09-21'));

      const quiet = build({ locations: [northBergen([])] });
      expect((await quiet.attention.gather()).unpublishedRota).toEqual([]);

      const loud = build({ locations: [northBergen([])], settings: { rotaWarningDays: 7 } });
      const [line] = (await loud.attention.gather()).unpublishedRota;
      expect(line).toMatch(/starting in 7 days/);
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

    it("only chases locations that are actually rota'd through the app", async () => {
      // A location scheduled some other way should not complain every night
      // forever, so the query requires recent published shifts.
      onThursday();
      const { attention, prisma } = build({ locations: [] });
      await attention.gather();

      const where = prisma.location.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where.shifts.some.status).toBe('PUBLISHED');
      const since = where.shifts.some.startsAt.gte;
      expect((date('2026-09-24').getTime() - since.getTime()) / 86_400_000).toBe(28);
    });
  });

  describe('required licenses not on file', () => {
    const provider = (credentials: unknown[]) => ({
      id: 'emp-9',
      firstName: 'Bola',
      lastName: 'Oyelaran',
      preferredName: null,
      jobRoles: [
        {
          jobRole: {
            name: 'Provider',
            credentialRequirements: [
              {
                credentialTypeId: 'dea',
                required: true,
                credentialType: {
                  id: 'dea',
                  name: 'DEA registration',
                  kind: 'REGISTRATION',
                  renewalMonths: 36,
                  sortOrder: 3,
                },
              },
              {
                credentialTypeId: 'bls',
                required: false,
                credentialType: {
                  id: 'bls',
                  name: 'BLS',
                  kind: 'LIFE_SUPPORT',
                  renewalMonths: 24,
                  sortOrder: 6,
                },
              },
            ],
          },
        },
      ],
      credentials,
    });

    it('names a required one with nothing on file, and never an optional one', async () => {
      const { attention } = build({ standing: [provider([])] });
      expect((await attention.gather()).missingCredentials).toEqual([
        'Bola Oyelaran — DEA registration, required for Provider, not on file',
      ]);
    });

    it('says nothing once one is on file, even if it has lapsed (that is chased as lapsed)', async () => {
      const { attention } = build({
        standing: [
          provider([
            { id: 'c1', name: 'DEA', credentialTypeId: 'dea', expiresOn: day('2020-01-01') },
          ]),
        ],
      });
      expect((await attention.gather()).missingCredentials).toEqual([]);
    });
  });

  describe('hours entered by hand', () => {
    const handEntry = {
      clockInAt: new Date('2026-09-28T13:00:00.000Z'),
      clockOutAt: new Date('2026-09-28T21:30:00.000Z'),
      handEntryReason: 'APP_REFUSED',
      handEntryNote: 'Said it could not find her location',
      employee: frankie,
      location: { name: 'North Bergen' },
      enteredBy: { firstName: 'Morgan', lastName: 'Manager' },
    };

    it('says whose, how long, who entered them and why', async () => {
      const { attention } = build({ handEntries: [handEntry] });
      expect((await attention.gather()).handEntries).toEqual([
        'Frankie Front-Desk — 8.50 hours on Sep 28, 2026 at North Bergen, entered by Morgan Manager: the app would not let them clock in (“Said it could not find her location”)',
      ]);
    });

    it('asks only for the ones nobody has looked into, however old', async () => {
      const { attention, prisma } = build();
      await attention.gather();
      const call = prisma.timeEntry.findMany.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([args]: any[]) => args.where.enteredByHandAt,
      );
      expect(call?.[0].where).toEqual({
        enteredByHandAt: { not: null },
        handEntryCheckedAt: null,
      });
    });

    it('is enough on its own to send the email, under its own heading', async () => {
      const { service, notifications } = build({ handEntries: [handEntry] });
      await expect(service.send()).resolves.toMatchObject({ sent: 2 });
      expect(notifications.dailyDigest.mock.calls[0][2].handEntries).toHaveLength(1);
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
      expect((date('2026-09-24').getTime() - where.clockInAt.lt.getTime()) / 86_400_000).toBe(7);
    });
  });

  describe('shifts nobody turned up for', () => {
    it('names the person, the day and the office, under Hours', async () => {
      onThursday();
      const { attention } = build({
        missedShifts: [
          {
            id: 'shift-1',
            employeeId: 'emp-1',
            locationId: 'nb',
            isRemote: false,
            // Tuesday 22 September, 9am–5pm in New Jersey.
            startsAt: new Date('2026-09-22T13:00:00Z'),
            endsAt: new Date('2026-09-22T21:00:00Z'),
            location: { name: 'North Bergen' },
            employee: { firstName: 'Max', preferredName: null, lastName: 'Medical' },
          },
        ],
      });

      expect((await attention.gather()).missedShifts).toEqual([
        'Max Medical — Tue, Sep 22, 9:00 AM–5:00 PM at North Bergen',
      ]);
      expect(DIGEST_TOPICS.HOURS).toContain('missedShifts');
    });
  });

  describe('shifts for people who have left', () => {
    it('groups them by person and gives the first date', async () => {
      onThursday();
      const { attention } = build({
        leaverShifts: [
          {
            startsAt: day('2026-09-28'),
            employeeId: 'emp-1',
            employee: { firstName: 'Max', lastName: 'Medical' },
          },
          {
            startsAt: day('2026-09-29'),
            employeeId: 'emp-1',
            employee: { firstName: 'Max', lastName: 'Medical' },
          },
        ],
      });

      expect((await attention.gather()).shiftsForLeavers).toEqual([
        'Max Medical — 2 shifts from Sep 28, 2026, but marked as no longer employed',
      ]);
    });

    it('keeps two people with the same name apart', async () => {
      // Grouping by display name merged them into one line with a combined
      // count: a wrong number in an email that names somebody. Unlikely in a
      // practice of twenty, and not the sort of thing to leave to chance.
      onThursday();
      const { attention } = build({
        leaverShifts: [
          {
            startsAt: day('2026-09-28'),
            employeeId: 'emp-1',
            employee: { firstName: 'Max', lastName: 'Medical' },
          },
          {
            startsAt: day('2026-09-29'),
            employeeId: 'emp-2',
            employee: { firstName: 'Max', lastName: 'Medical' },
          },
        ],
      });

      const { shiftsForLeavers } = await attention.gather();
      expect(shiftsForLeavers).toHaveLength(2);
      for (const line of shiftsForLeavers) expect(line).toMatch(/1 shift from/);
    });

    it('looks forward only — a shift they actually worked is not a mistake', async () => {
      onThursday();
      const { attention, prisma } = build();
      await attention.gather();

      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where.startsAt.gte).toEqual(date('2026-09-24'));
      expect(where.employee).toEqual({ employmentStatus: 'TERMINATED' });
      expect(where.status).toEqual({ not: 'CANCELLED' });
    });
  });

  describe('open shifts', () => {
    const open = (date: string, location: string, role: string | null) => ({
      startsAt: day(date),
      locationId: location === 'North Bergen' ? 'nb' : 'wny',
      location: { name: location },
      jobRole: role ? { name: role } : null,
    });

    it('gives one line per office, with the first date and what is needed', async () => {
      onThursday();
      const { attention } = build({
        openShifts: [
          open('2026-09-28', 'North Bergen', 'Front Desk'),
          open('2026-09-28', 'North Bergen', 'Front Desk'),
          open('2026-09-30', 'North Bergen', 'Medical Assistant'),
          open('2026-10-01', 'West New York', null),
        ],
      });
      expect((await attention.gather()).openShifts).toEqual([
        'North Bergen — 3 open shifts nobody is on yet, the first Sep 28, 2026 (Front Desk ×2, Medical Assistant)',
        'West New York — 1 open shift nobody is on yet, the first Oct 1, 2026 (any role)',
      ]);
    });

    it('asks only for shifts with nobody on them, not cancelled, in the next fortnight', async () => {
      onThursday();
      const { attention, prisma } = build();
      await attention.gather();
      const call = prisma.shift.findMany.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([args]: any[]) => args.where.employeeId === null,
      )!;
      expect(call).toBeDefined();
      expect(call[0].where.status).toEqual({ not: 'CANCELLED' });
      expect(call[0].where.startsAt.lt).toEqual(date('2026-10-09'));
    });
  });
  describe('closing checklists', () => {
    const answer = (kind: string, text: string, extra: Record<string, unknown> = {}) => ({
      kind,
      text,
      done: null,
      count: null,
      target: null,
      ...extra,
    });

    it('says who missed what at clock-out, a line each, and when nothing was filled in', async () => {
      const { attention } = build({
        closingRecords: [
          {
            day: new Date('2026-09-24T00:00:00Z'),
            submitted: true,
            employee: { firstName: 'Frankie', preferredName: null, lastName: 'Front-Desk' },
            location: { name: 'North Bergen' },
            answers: [
              answer('TASK', 'TVs off', { done: false }),
              answer('TASK', 'Forms available', { done: true }),
              answer('COUNT', 'Calls answered', { count: 12, target: 20 }),
              answer('COUNT', 'Calls placed', { count: 3 }),
            ],
          },
          {
            day: new Date('2026-09-24T00:00:00Z'),
            submitted: false,
            employee: { firstName: 'Maxwell', preferredName: 'Max', lastName: 'Assistant' },
            location: { name: 'West New York' },
            answers: [],
          },
        ],
      });
      expect((await attention.gather()).closingGaps).toEqual([
        'Frankie Front-Desk — North Bergen, Sep 24, 2026: TVs off; Calls answered 12 of 20',
        'Max Assistant — West New York, Sep 24, 2026: clocked out without the closing checklist',
      ]);
    });

    it('lists supplies to order, one line per office, saying how often each was asked for', async () => {
      const { attention } = build({
        supplies: [
          { text: 'Gloves S/M/L', timesAsked: 3, location: { name: 'North Bergen' } },
          { text: 'Lidocaine', timesAsked: 1, location: { name: 'North Bergen' } },
          { text: 'Electrodes', timesAsked: 1, location: { name: 'West New York' } },
        ],
      });
      expect((await attention.gather()).suppliesNeeded).toEqual([
        'North Bergen — 2 to order: Gloves S/M/L (asked 3 times), Lidocaine',
        'West New York — 1 to order: Electrodes',
      ]);
    });
  });

  describe('patterns in clocking in and out', () => {
    // Monday 5, 12 and 19 October 2026, 9:10am in New Jersey: late each time.
    const lateMonday = (date: string) => ({
      employeeId: 'frankie',
      clockInAt: new Date(`${date}T13:10:00Z`),
      clockOutAt: new Date(`${date}T21:00:00Z`),
      autoClockedOutAt: null,
      isLate: true,
      isEarlyDeparture: false,
      location: { timezone: 'America/New_York' },
      employee: { ...frankie, preferredName: null },
    });

    it('names somebody late three Mondays running, under Hours', async () => {
      const { attention } = build({
        patternPunches: ['2026-10-05', '2026-10-12', '2026-10-19'].map(lateMonday),
      });
      expect((await attention.gather()).punchPatterns).toEqual([
        'Frankie Front-Desk — Late 3 times in the last 4 weeks, 3 Mondays running',
      ]);
    });

    it('says nothing for one late morning', async () => {
      const { attention } = build({ patternPunches: [lateMonday('2026-10-05')] });
      expect((await attention.gather()).punchPatterns).toEqual([]);
    });
  });

  describe('the suggestion box', () => {
    it('says nothing when the box is empty', async () => {
      const { attention } = build({});
      expect((await attention.gather()).newSuggestions).toEqual([]);
    });

    it('counts what is waiting and says since when, never what it says', async () => {
      const { attention, prisma } = build({
        suggestions: [new Date('2026-09-30T00:00:00Z'), new Date('2026-10-01T00:00:00Z')],
      });
      expect((await attention.gather()).newSuggestions).toEqual([
        '2 suggestions waiting to be read, the oldest from Sep 30, 2026',
      ]);
      const [args] = prisma.feedback.aggregate.mock.calls[0];
      expect(args.where).toEqual({ archivedAt: null });
      expect(JSON.stringify(args)).not.toContain('message');
    });

    it('says one in the singular', async () => {
      const { attention } = build({ suggestions: [new Date('2026-10-01T00:00:00Z')] });
      expect((await attention.gather()).newSuggestions).toEqual([
        '1 suggestion waiting to be read, from Oct 1, 2026',
      ]);
    });
  });

  describe('shifts while an office is closed', () => {
    // Christmas Day, midnight to midnight in New Jersey.
    const christmas = {
      id: 'c-1',
      title: 'Christmas Day',
      startsAt: new Date('2026-12-25T05:00:00.000Z'),
      endsAt: new Date('2026-12-26T05:00:00.000Z'),
      audience: 'EVERYONE',
      locationId: null,
      location: null,
    };
    const shift = (who: typeof frankie | null, location: string, id: string) => ({
      startsAt: new Date('2026-12-25T14:00:00.000Z'),
      endsAt: new Date('2026-12-25T18:00:00.000Z'),
      locationId: id,
      location: { name: location },
      employee: who,
    });

    it('names each closure with the shifts in it, open ones included', async () => {
      jest.useFakeTimers().setSystemTime(day('2026-11-20'));
      const { attention } = build({
        closures: [christmas],
        closureShifts: [shift(frankie, 'North Bergen', 'nb'), shift(null, 'West New York', 'wny')],
      });
      expect((await attention.gather()).shiftsInClosures).toEqual([
        'Christmas Day, Dec 25, 2026 (both offices closed) — 2 shifts scheduled: Frankie Front-Desk at North Bergen, an open shift at West New York',
      ]);
    });

    it('only counts the office that is shut when one office closes', async () => {
      jest.useFakeTimers().setSystemTime(day('2026-11-20'));
      const { attention, prisma } = build({
        closures: [
          {
            ...christmas,
            title: 'Burst pipe',
            audience: 'LOCATION',
            locationId: 'nb',
            location: { name: 'North Bergen' },
          },
        ],
        closureShifts: [
          shift(frankie, 'North Bergen', 'nb'),
          shift(frankie, 'West New York', 'wny'),
        ],
      });
      const { shiftsInClosures } = await attention.gather();
      expect(shiftsInClosures).toEqual([
        'Burst pipe, Dec 25, 2026 (North Bergen closed) — 1 shift scheduled: Frankie Front-Desk at North Bergen',
      ]);
      const call = prisma.shift.findMany.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([args]: any[]) => args.where.OR,
      )!;
      expect(call[0].where.OR[0].locationId).toBe('nb');
    });
  });
});
