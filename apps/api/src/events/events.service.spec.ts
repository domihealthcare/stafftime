import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventAudience, NotificationKind, Role } from '@prisma/client';
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
    title: 'Office meeting',
    description: null,
    place: 'Break room',
    allDay: false,
    startsAt: new Date(FUTURE_START),
    endsAt: new Date(FUTURE_END),
    audience: EventAudience.EVERYONE,
    updatedAt: new Date('2026-09-20T09:00:00.000Z'),
    jobRole: null,
    location: null,
    ...over,
  };
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
  } = {},
) {
  // `invited` may be one list, or one list per call (before, then after).
  const lists = Array.isArray(options.invited?.[0])
    ? (options.invited as string[][])
    : [(options.invited as string[]) ?? ['emp-1', 'emp-2', 'mgr-1']];
  let call = 0;
  const practiceEvent = {
    findMany: jest.fn().mockResolvedValue([row()]),
    findUnique: jest.fn().mockResolvedValue('existing' in options ? options.existing : row()),
    create: jest.fn(async ({ data }) => row({ ...data })),
    update: jest.fn(async ({ data }) => row({ ...data })),
    delete: jest.fn().mockResolvedValue(row()),
  };
  const prisma = {
    practiceEvent,
    employee: {
      findMany: jest.fn(async () =>
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
    },
    jobRole: { count: jest.fn().mockResolvedValue(options.roleExists === false ? 0 : 1) },
    location: { count: jest.fn().mockResolvedValue(1) },
  };
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new EventsService(prisma as never, inbox as never),
    prisma,
    practiceEvent,
    inbox,
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
      const data = practiceEvent.create.mock.calls[0][0].data;
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
      const data = practiceEvent.create.mock.calls[0][0].data;
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
      const data = practiceEvent.create.mock.calls[0][0].data;
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
      expect(practiceEvent.create.mock.calls[0][0].data).toMatchObject({
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
