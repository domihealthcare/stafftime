import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventAudience, NotificationKind, PracticeEventKind, Role } from '@prisma/client';
import { EventInput } from './dto/event.dto';
import { describeWhen } from './event-time';
import { EventsService } from './events.service';

const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };
const staff = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };

/// Far enough ahead that "has it happened yet?" is always no.
const FUTURE_START = '2099-10-14T16:30:00.000Z';
const FUTURE_END = '2099-10-14T17:30:00.000Z';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    kind: PracticeEventKind.EVENT,
    title: 'Office meeting',
    description: null,
    place: 'Break room',
    allDay: false,
    startsAt: new Date(FUTURE_START),
    endsAt: new Date(FUTURE_END),
    audience: EventAudience.EVERYONE,
    updatedAt: new Date('2026-09-20T09:00:00.000Z'),
    seriesId: null,
    jobRole: null,
    location: null,
    invitees: [],
    series: null,
    ...over,
  };
}

const OFFICES: Record<string, string> = { 'loc-nb': 'North Bergen', 'loc-wny': 'West New York' };
const ROLES: Record<string, string> = { 'role-fd': 'Front Desk', 'role-pr': 'Provider' };
const PEOPLE: Record<string, string> = { 'emp-kayla': 'Kayla', 'emp-angelina': 'Angelina' };

/// What the database would give back for a row written with `data`.
function stored(data: Record<string, unknown>) {
  const jobRoleId = data.jobRoleId as string | null | undefined;
  const locationId = data.locationId as string | null | undefined;
  return row({
    ...data,
    jobRole: jobRoleId ? { id: jobRoleId, name: ROLES[jobRoleId] ?? 'Role', colour: 'blue' } : null,
    location: locationId ? { id: locationId, name: OFFICES[locationId] ?? 'Office' } : null,
  });
}

function input(over: Partial<EventInput> = {}): EventInput {
  return {
    title: 'Office meeting',
    place: 'Break room',
    allDay: false,
    startsAt: FUTURE_START,
    endsAt: FUTURE_END,
    audience: EventAudience.EVERYONE,
    ...over,
  };
}

function build(
  options: {
    existing?: unknown;
    person?: unknown;
    invited?: string[] | string[][];
    roleExists?: boolean;
    /// How many dates a "this and all after" removal takes, and how many are left.
    cut?: { removed: number; left: number };
  } = {},
) {
  // `invited` may be one list, or one list per call (before, then after).
  const lists = Array.isArray(options.invited?.[0])
    ? (options.invited as string[][])
    : [(options.invited as string[]) ?? ['emp-1', 'emp-2', 'mgr-1']];
  let call = 0;
  const existing = 'existing' in options ? options.existing : row();

  // Rows written during the test, by id, as the database would hold them.
  const rows = new Map<string, ReturnType<typeof row>>();
  const practiceEvent = {
    findMany: jest.fn().mockResolvedValue([row()]),
    findUnique: jest.fn().mockResolvedValue(existing),
    findUniqueOrThrow: jest.fn(async ({ where }) => rows.get(where.id) ?? existing),
    create: jest.fn(async ({ data }) => stored(data)),
    createMany: jest.fn(async ({ data }) => {
      for (const one of data) rows.set(one.id, stored(one));
      return { count: data.length };
    }),
    update: jest.fn(async ({ where, data }) => {
      const merged = stored({ ...(rows.get(where.id) ?? (existing as object)), ...data });
      rows.set(where.id, merged);
      return merged;
    }),
    delete: jest.fn().mockResolvedValue(row()),
    deleteMany: jest.fn().mockResolvedValue({ count: options.cut?.removed ?? 1 }),
    count: jest.fn().mockResolvedValue(options.cut?.left ?? 0),
  };
  const practiceEventInvitee = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn(async ({ data }) => {
      for (const invitee of data) {
        const event = rows.get(invitee.eventId);
        if (!event) continue;
        (event.invitees as unknown[]).push({
          employee: invitee.employeeId
            ? {
                id: invitee.employeeId,
                firstName: PEOPLE[invitee.employeeId] ?? 'Someone',
                lastName: 'X',
                preferredName: null,
              }
            : null,
          jobRole: invitee.jobRoleId
            ? { id: invitee.jobRoleId, name: ROLES[invitee.jobRoleId] ?? 'Role', colour: 'blue' }
            : null,
          location: invitee.locationId
            ? { id: invitee.locationId, name: OFFICES[invitee.locationId] ?? 'Office' }
            : null,
        });
      }
      return { count: data.length };
    }),
  };
  const practiceEventSeries = {
    create: jest.fn().mockResolvedValue({ id: 'series-1' }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  // What runs inside a transaction: the same stand-ins.
  const tx = { practiceEvent, practiceEventInvitee, practiceEventSeries };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    employee: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      findMany: jest.fn(async (_args: { where: Record<string, unknown> }) =>
        lists[Math.min(call++, lists.length - 1)].map((id) => ({ id })),
      ),
      findUnique: jest.fn().mockResolvedValue(
        'person' in options
          ? options.person
          : {
              employmentStatus: 'ACTIVE',
              jobRoles: [{ jobRoleId: 'role-fd' }],
              locations: [{ locationId: 'loc-nb' }],
            },
      ),
      count: jest.fn(async ({ where }) => where.id.in.length),
    },
    jobRole: {
      count: jest.fn(async ({ where }) =>
        options.roleExists === false ? 0 : where.id?.in ? where.id.in.length : 1,
      ),
    },
    location: {
      count: jest.fn(async ({ where }) => (where.id?.in ? where.id.in.length : 1)),
    },
  };
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new EventsService(prisma as never, inbox as never),
    prisma,
    practiceEvent,
    practiceEventInvitee,
    practiceEventSeries,
    inbox,
    rows,
  };
}

describe('EventsService', () => {
  describe('reading', () => {
    it('shows a manager every event in the range', async () => {
      const { service, practiceEvent, prisma } = build();
      await service.list('2026-10-12T04:00:00.000Z', '2026-10-19T04:00:00.000Z', manager);

      const where = practiceEvent.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it('asks for anything overlapping the range, not only what starts in it', async () => {
      const { service, practiceEvent } = build();
      await service.list('2026-10-12T04:00:00.000Z', '2026-10-19T04:00:00.000Z', manager);

      const where = practiceEvent.findMany.mock.calls[0][0].where;
      expect(where.startsAt).toEqual({ lt: new Date('2026-10-19T04:00:00.000Z') });
      expect(where.endsAt).toEqual({ gt: new Date('2026-10-12T04:00:00.000Z') });
    });

    it('shows staff everyone’s events, their job roles’ and their offices’', async () => {
      const { service, practiceEvent } = build();
      await service.list('2026-10-12T04:00:00.000Z', '2026-10-19T04:00:00.000Z', staff);

      expect(practiceEvent.findMany.mock.calls[0][0].where.OR).toEqual([
        { audience: EventAudience.EVERYONE },
        { audience: EventAudience.JOB_ROLE, jobRoleId: { in: ['role-fd'] } },
        { audience: EventAudience.LOCATION, locationId: { in: ['loc-nb'] } },
        {
          audience: EventAudience.CHOSEN,
          invitees: {
            some: {
              OR: [
                { employeeId: 'emp-1' },
                { jobRoleId: { in: ['role-fd'] } },
                { locationId: { in: ['loc-nb'] } },
              ],
            },
          },
        },
      ]);
    });

    it('shows somebody who has left nothing', async () => {
      const { service, practiceEvent } = build({
        person: { employmentStatus: 'TERMINATED', jobRoles: [], locations: [] },
      });
      await service.list('2026-10-12T04:00:00.000Z', '2026-10-19T04:00:00.000Z', staff);

      expect(practiceEvent.findMany.mock.calls[0][0].where.id).toEqual({ in: [] });
    });

    it('refuses a backwards or enormous range', async () => {
      const { service } = build();
      await expect(
        service.list('2026-10-19T00:00:00.000Z', '2026-10-12T00:00:00.000Z', staff),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.list('2026-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z', staff),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('gives an all-day event its days on the practice clock', async () => {
      const { service, practiceEvent } = build();
      practiceEvent.findMany.mockResolvedValue([
        row({
          allDay: true,
          startsAt: new Date('2026-10-15T04:00:00.000Z'),
          endsAt: new Date('2026-10-17T04:00:00.000Z'),
        }),
      ]);
      const [event] = await service.list(
        '2026-10-12T04:00:00.000Z',
        '2026-10-19T04:00:00.000Z',
        staff,
      );
      expect(event).toMatchObject({ startDate: '2026-10-15', endDate: '2026-10-16' });
    });
  });

  describe('making one', () => {
    it('saves what was typed, trimmed, and who made it', async () => {
      const { service, practiceEvent } = build();
      await service.create(
        input({ title: '  Office meeting ', description: '  ', place: ' Break room ' }),
        manager,
      );
      const data = practiceEvent.createMany.mock.calls[0][0].data[0];
      expect(data).toMatchObject({
        title: 'Office meeting',
        description: null,
        place: 'Break room',
        createdById: 'mgr-1',
        jobRoleId: null,
        locationId: null,
      });
    });

    it('stores an all-day event from midnight to midnight in New Jersey', async () => {
      const { service, practiceEvent } = build();
      await service.create(
        input({
          allDay: true,
          startsAt: undefined,
          endsAt: undefined,
          startDate: '2026-10-15',
          endDate: '2026-10-16',
        }),
        manager,
      );
      const data = practiceEvent.createMany.mock.calls[0][0].data[0];
      // EDT is four hours behind UTC in October.
      expect(data.startsAt).toEqual(new Date('2026-10-15T04:00:00.000Z'));
      expect(data.endsAt).toEqual(new Date('2026-10-17T04:00:00.000Z'));
    });

    it('keeps an all-day event whole across the clocks going back', async () => {
      const { service, practiceEvent } = build();
      await service.create(
        input({
          allDay: true,
          startsAt: undefined,
          endsAt: undefined,
          startDate: '2026-11-01',
          endDate: '2026-11-01',
        }),
        manager,
      );
      const data = practiceEvent.createMany.mock.calls[0][0].data[0];
      expect(data.startsAt).toEqual(new Date('2026-11-01T04:00:00.000Z'));
      // A 25-hour day: midnight on the 2nd is in EST.
      expect(data.endsAt).toEqual(new Date('2026-11-02T05:00:00.000Z'));
    });

    it('refuses an event that ends before it starts', async () => {
      const { service } = build();
      await expect(
        service.create(input({ startsAt: FUTURE_END, endsAt: FUTURE_START }), manager),
      ).rejects.toThrow('The event must end after it starts.');
      await expect(
        service.create(
          input({ allDay: true, startDate: '2026-10-16', endDate: '2026-10-15' }),
          manager,
        ),
      ).rejects.toThrow('The last day cannot be before the first.');
    });

    it('refuses a timed event that runs for weeks', async () => {
      const { service } = build();
      await expect(
        service.create(input({ endsAt: '2099-11-14T17:30:00.000Z' }), manager),
      ).rejects.toThrow(/All day/);
    });

    it('needs the job role or the office it is for', async () => {
      const { service } = build();
      await expect(
        service.create(input({ audience: EventAudience.JOB_ROLE }), manager),
      ).rejects.toThrow('Choose which job role it is for.');
      await expect(
        service.create(input({ audience: EventAudience.LOCATION }), manager),
      ).rejects.toThrow('Choose which location it is for.');
    });

    it('refuses a job role that has gone', async () => {
      const { service } = build({ roleExists: false });
      await expect(
        service.create(input({ audience: EventAudience.JOB_ROLE, jobRoleId: 'role-x' }), manager),
      ).rejects.toThrow('That job role no longer exists.');
    });

    it('keeps only the id that matches the audience', async () => {
      const { service, practiceEvent } = build();
      await service.create(
        input({ audience: EventAudience.JOB_ROLE, jobRoleId: 'role-pr', locationId: 'loc-nb' }),
        manager,
      );
      expect(practiceEvent.createMany.mock.calls[0][0].data[0]).toMatchObject({
        audience: EventAudience.JOB_ROLE,
        jobRoleId: 'role-pr',
        locationId: null,
      });
    });

    it('tells everybody it is for, under the bell — but not the manager who made it', async () => {
      const { service, inbox } = build({ invited: ['emp-1', 'emp-2', 'mgr-1'] });
      await service.create(input(), manager);

      expect(inbox.notify).toHaveBeenCalledTimes(1);
      const [who, notice] = inbox.notify.mock.calls[0];
      expect(who).toEqual(['emp-1', 'emp-2']);
      expect(notice).toMatchObject({
        kind: NotificationKind.EVENT,
        title: 'New event: Office meeting',
        link: '/schedule?week=2099-10-14',
      });
      expect(notice.body).toContain('Break room');
    });

    it('tells nobody about an event already over', async () => {
      const { service, inbox } = build();
      await service.create(
        input({ startsAt: '2020-01-01T15:00:00.000Z', endsAt: '2020-01-01T16:00:00.000Z' }),
        manager,
      );
      expect(inbox.notify).not.toHaveBeenCalled();
    });
  });

  describe('changing one', () => {
    it('says it changed when the time moves', async () => {
      const { service, inbox } = build({ invited: ['emp-1', 'emp-2'] });
      await service.update(
        'ev-1',
        input({ startsAt: '2099-10-14T17:00:00.000Z', endsAt: '2099-10-14T18:00:00.000Z' }),
        manager,
      );
      const titles = inbox.notify.mock.calls
        .filter(([who]) => who.length > 0)
        .map(([, notice]) => notice.title);
      expect(titles).toEqual(['Event changed: Office meeting']);
    });

    it('stays quiet when only the description is reworded', async () => {
      const { service, inbox } = build();
      await service.update('ev-1', input({ description: 'Bring a pen.' }), manager);
      expect(inbox.notify).not.toHaveBeenCalled();
    });

    it('tells newcomers it is new, and people dropped that it is off their schedule', async () => {
      const { service, inbox } = build({
        existing: row(),
        // Before: everyone was emp-1 and emp-2. After: the Provider role is emp-2 and emp-3.
        invited: [
          ['emp-1', 'emp-2'],
          ['emp-2', 'emp-3'],
        ],
      });
      await service.update(
        'ev-1',
        input({ audience: EventAudience.JOB_ROLE, jobRoleId: 'role-pr' }),
        manager,
      );
      const sent = inbox.notify.mock.calls
        .filter(([who]) => who.length > 0)
        .map(([who, notice]) => [who, notice.title]);
      expect(sent).toEqual([
        [['emp-3'], 'New event: Office meeting'],
        [['emp-1'], 'No longer on your schedule: Office meeting'],
      ]);
    });

    it('is not found once removed', async () => {
      const { service } = build({ existing: null });
      await expect(service.update('ev-1', input(), manager)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('removing one', () => {
    it('tells the people it was for that it is cancelled', async () => {
      const { service, inbox, practiceEvent } = build({ invited: ['emp-1', 'mgr-1'] });
      await service.remove('ev-1', manager);

      expect(practiceEvent.delete).toHaveBeenCalledWith({ where: { id: 'ev-1' } });
      const [who, notice] = inbox.notify.mock.calls[0];
      expect(who).toEqual(['emp-1']);
      expect(notice.title).toBe('Cancelled: Office meeting');
    });

    it('does not announce the removal of something long past', async () => {
      const { service, inbox } = build({
        existing: row({
          startsAt: new Date('2020-01-01T15:00:00.000Z'),
          endsAt: new Date('2020-01-01T16:00:00.000Z'),
        }),
      });
      await service.remove('ev-1', manager);
      expect(inbox.notify.mock.calls[0][0]).toEqual([]);
    });
  });
});

describe('closures', () => {
  const christmasInput = (over: Partial<EventInput> = {}): EventInput => ({
    kind: PracticeEventKind.CLOSURE,
    title: 'Christmas Day',
    allDay: true,
    startDate: '2099-12-25',
    endDate: '2099-12-25',
    audience: EventAudience.EVERYONE,
    ...over,
  });

  it('is for both offices or one, never a job role', async () => {
    const { service } = build();
    await expect(
      service.create(
        christmasInput({ audience: EventAudience.JOB_ROLE, jobRoleId: 'role-pr' }),
        manager,
      ),
    ).rejects.toThrow(
      'A closure is for both offices or one office — not a job role or a list of people.',
    );
  });

  it('keeps no place: it is where the office is', async () => {
    const { service, practiceEvent } = build();
    await service.create(christmasInput({ place: 'Somewhere' }), manager);
    expect(practiceEvent.createMany.mock.calls[0][0].data[0]).toMatchObject({
      kind: PracticeEventKind.CLOSURE,
      place: null,
    });
  });

  it('tells people their office is closed, in those words', async () => {
    const { service, inbox } = build();
    await service.create(
      christmasInput({
        title: 'Burst pipe',
        audience: EventAudience.LOCATION,
        locationId: 'loc-nb',
        allDay: false,
        startsAt: '2099-12-10T18:00:00.000Z',
        endsAt: '2099-12-10T22:00:00.000Z',
      }),
      manager,
    );
    const [, notice] = inbox.notify.mock.calls[0];
    expect(notice.title).toBe('North Bergen closed: Burst pipe');
    expect(notice.body).toMatch(/North Bergen$/);
  });

  it('says "open as usual" when a closure is removed', async () => {
    const { service, inbox } = build({
      existing: row({ kind: PracticeEventKind.CLOSURE, title: 'Christmas Eve', place: null }),
    });
    await service.remove('ev-1', manager);
    expect(inbox.notify.mock.calls[0][1].title).toBe('Open as usual: Christmas Eve');
    expect(inbox.notify.mock.calls[0][1].body).toMatch(/Both offices$/);
  });

  describe('copying a year', () => {
    const lastYear = [
      // Christmas Day 2026, all day.
      row({
        id: 'c-1',
        kind: PracticeEventKind.CLOSURE,
        title: 'Christmas Day',
        place: null,
        allDay: true,
        startsAt: new Date('2026-12-25T05:00:00.000Z'),
        endsAt: new Date('2026-12-26T05:00:00.000Z'),
        locationId: null,
        jobRoleId: null,
      }),
      // Christmas Eve 2026 from 1pm to midnight, North Bergen only.
      row({
        id: 'c-2',
        kind: PracticeEventKind.CLOSURE,
        title: 'Christmas Eve',
        place: null,
        startsAt: new Date('2026-12-24T18:00:00.000Z'),
        endsAt: new Date('2026-12-25T05:00:00.000Z'),
        audience: EventAudience.LOCATION,
        locationId: 'loc-nb',
        location: { id: 'loc-nb', name: 'North Bergen' },
        jobRoleId: null,
      }),
    ];

    it('puts each closure on the same date a year on, at the same wall-clock times', async () => {
      const { service, practiceEvent } = build();
      practiceEvent.findMany.mockResolvedValue(lastYear);
      const result = await service.copyClosures(2026, manager);

      expect(result).toMatchObject({ copied: 2, skipped: [], toYear: 2027 });
      const [day, eve] = practiceEvent.create.mock.calls.map(([args]) => args.data);
      expect(day).toMatchObject({
        kind: PracticeEventKind.CLOSURE,
        title: 'Christmas Day',
        allDay: true,
        startsAt: new Date('2027-12-25T05:00:00.000Z'),
        endsAt: new Date('2027-12-26T05:00:00.000Z'),
        audience: EventAudience.EVERYONE,
        locationId: null,
        createdById: 'mgr-1',
      });
      expect(eve).toMatchObject({
        title: 'Christmas Eve',
        allDay: false,
        startsAt: new Date('2027-12-24T18:00:00.000Z'),
        endsAt: new Date('2027-12-25T05:00:00.000Z'),
        audience: EventAudience.LOCATION,
        locationId: 'loc-nb',
      });
    });

    it('only looks at closures in the year asked for, on the practice clock', async () => {
      const { service, practiceEvent } = build();
      practiceEvent.findMany.mockResolvedValue([]);
      await service.copyClosures(2026, manager);
      expect(practiceEvent.findMany.mock.calls[0][0].where).toEqual({
        kind: PracticeEventKind.CLOSURE,
        startsAt: {
          gte: new Date('2026-01-01T05:00:00.000Z'),
          lt: new Date('2027-01-01T05:00:00.000Z'),
        },
      });
    });

    it('skips what is already there, so pressing it twice does nothing more', async () => {
      const { service, practiceEvent } = build();
      practiceEvent.findMany.mockResolvedValue(lastYear);
      practiceEvent.count.mockResolvedValue(1);
      const result = await service.copyClosures(2026, manager);
      expect(result.copied).toBe(0);
      expect(result.skipped).toEqual([
        "Christmas Day — already on 2027's calendar",
        "Christmas Eve — already on 2027's calendar",
      ]);
      expect(practiceEvent.create).not.toHaveBeenCalled();
    });

    it('does not guess where 29 February goes', async () => {
      const { service, practiceEvent } = build();
      practiceEvent.findMany.mockResolvedValue([
        row({
          kind: PracticeEventKind.CLOSURE,
          title: 'Leap day',
          allDay: true,
          startsAt: new Date('2028-02-29T05:00:00.000Z'),
          endsAt: new Date('2028-03-01T05:00:00.000Z'),
        }),
      ]);
      const result = await service.copyClosures(2028, manager);
      expect(result.skipped).toEqual(['Leap day — 29 February has no date in 2029']);
    });

    it('sends each person one notification for the lot, not one per holiday', async () => {
      const { service, practiceEvent, inbox } = build({ invited: ['emp-1', 'mgr-1'] });
      practiceEvent.findMany.mockResolvedValue(lastYear);
      await service.copyClosures(2026, manager);
      expect(inbox.notify).toHaveBeenCalledTimes(1);
      const [who, notice] = inbox.notify.mock.calls[0];
      expect(who).toEqual(['emp-1']);
      expect(notice).toMatchObject({
        title: '2027 holidays are on the schedule',
        body: '2 closures: Christmas Day, Christmas Eve',
      });
    });
  });
});

describe('chosen people', () => {
  const chosen = (over: Partial<EventInput> = {}) =>
    input({
      title: 'Admin meeting',
      audience: EventAudience.CHOSEN,
      invitees: { jobRoleIds: ['role-pr'], employeeIds: ['emp-kayla', 'emp-angelina'] },
      ...over,
    });

  it('keeps any mix of job roles and people, on every date', async () => {
    const { service, practiceEventInvitee } = build();
    await service.create(chosen(), manager);
    const written = practiceEventInvitee.createMany.mock.calls[0][0].data;
    expect(written).toHaveLength(3);
    expect(written).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeId: 'emp-kayla' }),
        expect.objectContaining({ employeeId: 'emp-angelina' }),
        expect.objectContaining({ jobRoleId: 'role-pr' }),
      ]),
    );
  });

  it('shows them by name', async () => {
    const { service } = build();
    const event = await service.create(chosen(), manager);
    expect(event.invitees.map((i) => i.name).sort()).toEqual(['Angelina X', 'Kayla X', 'Provider']);
  });

  it('needs somebody on the list', async () => {
    const { service } = build();
    await expect(service.create(chosen({ invitees: {} }), manager)).rejects.toThrow(
      'Add who it is for.',
    );
  });

  it('refuses somebody who no longer exists', async () => {
    const { service, prisma } = build();
    prisma.employee.count.mockResolvedValue(1);
    await expect(service.create(chosen(), manager)).rejects.toThrow(
      'Somebody or something on the list no longer exists.',
    );
  });

  it('tells exactly the people on the list: the role’s members and the named people', async () => {
    const { service, prisma } = build();
    await service.create(chosen(), manager);
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { id: { in: ['emp-kayla', 'emp-angelina'] } },
      { jobRoles: { some: { jobRoleId: { in: ['role-pr'] } } } },
    ]);
  });

  it('is not for a closure', async () => {
    const { service } = build();
    await expect(
      service.create(chosen({ kind: PracticeEventKind.CLOSURE }), manager),
    ).rejects.toThrow(/not a job role or a list of people/);
  });
});

describe('repeating', () => {
  // Fridays 9–10am in New Jersey, from Friday 2 October 2099.
  const fridays = (over: Partial<EventInput> = {}) =>
    input({
      startsAt: '2099-10-02T13:00:00.000Z',
      endsAt: '2099-10-02T14:00:00.000Z',
      repeat: { frequency: 'WEEKLY', interval: 2, weekdays: [5], until: '2099-11-13' },
      ...over,
    });

  it('writes one row per date, every 2 weeks, all in the one series', async () => {
    const { service, practiceEvent, practiceEventSeries } = build();
    const result = await service.create(fridays(), manager);

    expect(result.created).toBe(4);
    const written = practiceEvent.createMany.mock.calls[0][0].data;
    expect(written.map((w: { startsAt: Date }) => w.startsAt.toISOString())).toEqual([
      '2099-10-02T13:00:00.000Z',
      '2099-10-16T13:00:00.000Z',
      '2099-10-30T13:00:00.000Z',
      // The clocks have gone back: still 9am in New Jersey.
      '2099-11-13T14:00:00.000Z',
    ]);
    expect(written.every((w: { seriesId: string }) => w.seriesId === 'series-1')).toBe(true);
    expect(practiceEventSeries.create.mock.calls[0][0].data).toMatchObject({
      frequency: 'WEEKLY',
      interval: 2,
      weekdays: [5],
      firstDate: new Date('2099-10-02T00:00:00.000Z'),
      untilDate: new Date('2099-11-13T00:00:00.000Z'),
    });
  });

  it('sends one notification for the whole series, saying how it repeats', async () => {
    const { service, inbox } = build({ invited: ['emp-1', 'mgr-1'] });
    await service.create(fridays(), manager);
    expect(inbox.notify).toHaveBeenCalledTimes(1);
    const [who, notice] = inbox.notify.mock.calls[0];
    expect(who).toEqual(['emp-1']);
    expect(notice.title).toBe('New event: Office meeting');
    expect(notice.body).toMatch(
      /^Every 2 weeks on Fri until Nov 13, 2099\. First: Fri, Oct 2, 9:00 AM/,
    );
  });

  it('refuses a rule that never lands before it stops', async () => {
    const { service } = build();
    // A Monday-only series from a Friday that stops that Sunday.
    await expect(
      service.create(
        fridays({
          repeat: { frequency: 'WEEKLY', interval: 1, weekdays: [1], until: '2099-10-04' },
        }),
        manager,
      ),
    ).rejects.toThrow(/never land on a day/);
  });

  it('refuses a rule that makes no sense, in words', async () => {
    const { service } = build();
    await expect(
      service.create(
        fridays({
          repeat: { frequency: 'WEEKLY', interval: 1, weekdays: [], until: '2099-11-13' },
        }),
        manager,
      ),
    ).rejects.toThrow('Choose at least one day of the week.');
  });

  describe('changing one', () => {
    const inSeries = () =>
      row({
        id: 'ev-3',
        seriesId: 'series-1',
        startsAt: new Date('2099-10-30T13:00:00.000Z'),
        endsAt: new Date('2099-10-30T14:00:00.000Z'),
      });

    it('moves just that date, and it stays in the series', async () => {
      const { service, practiceEvent } = build({ existing: inSeries() });
      await service.update(
        'ev-3',
        input({ startsAt: '2099-10-30T14:00:00.000Z', endsAt: '2099-10-30T15:00:00.000Z' }),
        manager,
        'one',
      );
      expect(practiceEvent.update).toHaveBeenCalledTimes(1);
      expect(practiceEvent.deleteMany).not.toHaveBeenCalled();
      expect(practiceEvent.createMany).not.toHaveBeenCalled();
    });

    it('from here on: ends the old series the day before and starts a new one', async () => {
      const { service, practiceEvent, practiceEventSeries } = build({
        existing: inSeries(),
        cut: { removed: 2, left: 2 },
      });
      await service.update(
        'ev-3',
        fridays({
          startsAt: '2099-10-30T14:00:00.000Z',
          endsAt: '2099-10-30T15:00:00.000Z',
          repeat: { frequency: 'WEEKLY', interval: 2, weekdays: [5], until: '2099-12-25' },
        }),
        manager,
        'following',
      );
      expect(practiceEvent.deleteMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1', startsAt: { gte: new Date('2099-10-30T13:00:00.000Z') } },
      });
      expect(practiceEventSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { untilDate: new Date('2099-10-29T00:00:00.000Z') },
      });
      // Oct 30, Nov 13, Nov 27, Dec 11, Dec 25 — at 10am now.
      const written = practiceEvent.createMany.mock.calls[0][0].data;
      expect(written).toHaveLength(5);
      expect(written[1].startsAt.toISOString()).toBe('2099-11-13T15:00:00.000Z');
    });

    it('from the very first date: the old series goes altogether', async () => {
      const { service, practiceEventSeries } = build({
        existing: inSeries(),
        cut: { removed: 4, left: 0 },
      });
      await service.update('ev-3', fridays(), manager, 'following');
      expect(practiceEventSeries.delete).toHaveBeenCalledWith({ where: { id: 'series-1' } });
      expect(practiceEventSeries.update).not.toHaveBeenCalled();
    });

    it('giving a one-off event a repeat makes it the first of a series', async () => {
      const { service, practiceEvent } = build({ existing: row() });
      const result = await service.update('ev-1', fridays(), manager, 'one');
      expect(practiceEvent.delete).toHaveBeenCalledWith({ where: { id: 'ev-1' } });
      expect(result.created).toBe(4);
    });
  });

  describe('removing', () => {
    const inSeries = row({ id: 'ev-3', seriesId: 'series-1' });

    it('just this one leaves the rest of the series alone', async () => {
      const { service, practiceEvent } = build({ existing: inSeries });
      const result = await service.remove('ev-3', manager, 'one');
      expect(practiceEvent.delete).toHaveBeenCalledWith({ where: { id: 'ev-3' } });
      expect(practiceEvent.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: 1 });
    });

    it('this and all after it, with one notification saying so', async () => {
      const { service, practiceEvent, inbox } = build({
        existing: inSeries,
        cut: { removed: 5, left: 3 },
        invited: ['emp-1'],
      });
      const result = await service.remove('ev-3', manager, 'following');
      expect(practiceEvent.deleteMany).toHaveBeenCalled();
      expect(result).toEqual({ deleted: 5 });
      expect(inbox.notify).toHaveBeenCalledTimes(1);
      expect(inbox.notify.mock.calls[0][1]).toMatchObject({
        title: 'Cancelled: Office meeting',
        body: expect.stringMatching(/ on — 5 dates\.$/),
      });
    });
  });
});

describe('reminders the day before', () => {
  // 5am in New Jersey on Thursday 1 October 2099, when the nightly job runs.
  const NOW = new Date('2099-10-01T09:00:00.000Z');

  it('asks for what starts tomorrow on the practice’s clock, not yet reminded', async () => {
    const { service, practiceEvent } = build();
    practiceEvent.findMany.mockResolvedValue([]);
    await service.sendReminders(NOW);
    expect(practiceEvent.findMany.mock.calls[0][0].where).toEqual({
      startsAt: {
        gte: new Date('2099-10-02T04:00:00.000Z'),
        lt: new Date('2099-10-03T04:00:00.000Z'),
      },
      reminderSentAt: null,
    });
  });

  it('tells everybody it is for, and marks it so it is never sent twice', async () => {
    const { service, practiceEvent, inbox } = build({ invited: ['emp-1', 'mgr-1'] });
    practiceEvent.findMany.mockResolvedValue([
      row({
        startsAt: new Date('2099-10-02T13:00:00.000Z'),
        endsAt: new Date('2099-10-02T14:00:00.000Z'),
      }),
    ]);
    const sent = await service.sendReminders(NOW);

    expect(sent).toBe(1);
    const [who, notice] = inbox.notify.mock.calls[0];
    // The manager who made it is reminded too.
    expect(who).toEqual(['emp-1', 'mgr-1']);
    expect(notice.title).toBe('Tomorrow: Office meeting');
    expect(notice.body).toBe('Fri, Oct 2, 9:00 AM–10:00 AM · Break room');
    expect(practiceEvent.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { reminderSentAt: NOW },
    });
  });

  it('reminds staff an office is closed tomorrow', async () => {
    const { service, practiceEvent, inbox } = build();
    practiceEvent.findMany.mockResolvedValue([
      stored({
        kind: PracticeEventKind.CLOSURE,
        title: 'Christmas Eve',
        place: null,
        audience: EventAudience.LOCATION,
        locationId: 'loc-nb',
        startsAt: new Date('2099-10-02T17:00:00.000Z'),
        endsAt: new Date('2099-10-03T04:00:00.000Z'),
      }),
    ]);
    await service.sendReminders(NOW);
    expect(inbox.notify.mock.calls[0][1].title).toBe(
      'Tomorrow — north bergen closed: Christmas Eve',
    );
  });
});

describe('describeWhen', () => {
  it('reads a meeting on the practice clock', () => {
    expect(
      describeWhen({
        allDay: false,
        startsAt: new Date('2026-10-14T16:30:00.000Z'),
        endsAt: new Date('2026-10-14T17:30:00.000Z'),
      }),
    ).toBe('Wed, Oct 14, 12:30 PM–1:30 PM');
  });

  it('reads a single all-day event as its day', () => {
    expect(
      describeWhen({
        allDay: true,
        startsAt: new Date('2026-10-15T04:00:00.000Z'),
        endsAt: new Date('2026-10-16T04:00:00.000Z'),
      }),
    ).toBe('Thu, Oct 15');
  });

  it('reads several days as a range', () => {
    expect(
      describeWhen({
        allDay: true,
        startsAt: new Date('2026-10-15T04:00:00.000Z'),
        endsAt: new Date('2026-10-17T04:00:00.000Z'),
      }),
    ).toBe('Thu, Oct 15 – Fri, Oct 16');
  });

  it('names both days when an evening runs past midnight', () => {
    expect(
      describeWhen({
        allDay: false,
        startsAt: new Date('2026-10-16T22:00:00.000Z'),
        endsAt: new Date('2026-10-17T05:00:00.000Z'),
      }),
    ).toBe('Fri, Oct 16, 6:00 PM – Sat, Oct 17, 1:00 AM');
  });
});
