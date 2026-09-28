import { CalendarInviteKind, PracticeEventKind, Prisma, ShiftStatus } from '@prisma/client';
import { GoogleProblem } from '../google/google-auth.service';
import {
  CalendarInvitesService,
  eventInvite,
  googleEventIdOf,
  SHIFT_INVITE_DAYS,
  shiftInvite,
} from './invites.service';

const NOW = new Date('2026-10-01T12:00:00.000Z');

const SHIFT = {
  id: '11111111-2222-4333-8444-555555555555',
  startsAt: new Date('2026-10-02T12:00:00.000Z'),
  endsAt: new Date('2026-10-02T20:00:00.000Z'),
  notes: null,
  isRemote: false,
  employee: { email: 'Frankie@Example.com' },
  location: { name: 'North Bergen', addressLine1: '1 Main St', city: 'North Bergen', state: 'NJ' },
};

const MEETING = {
  id: '99999999-2222-4333-8444-555555555555',
  kind: PracticeEventKind.EVENT,
  title: 'Office meeting',
  description: 'Bring your questions.',
  place: null,
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  allDay: false,
  startsAt: new Date('2026-10-09T13:00:00.000Z'),
  endsAt: new Date('2026-10-09T14:00:00.000Z'),
  audience: 'EVERYONE',
  jobRole: null,
  location: null,
  invitees: [],
};

function build(
  options: {
    enabled?: boolean;
    shifts?: unknown[];
    events?: unknown[];
    people?: { email: string }[];
    sent?: unknown[];
  } = {},
) {
  const prisma = {
    shift: { findMany: jest.fn().mockResolvedValue(options.shifts ?? []) },
    practiceEvent: { findMany: jest.fn().mockResolvedValue(options.events ?? []) },
    employee: { findMany: jest.fn().mockResolvedValue(options.people ?? []) },
    calendarInvite: {
      findMany: jest.fn().mockResolvedValue(options.sent ?? []),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    googleCalendar: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const google = {
    enabled: options.enabled ?? true,
    put: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new CalendarInvitesService(prisma as any, google as any), prisma, google };
}

describe('CalendarInvitesService', () => {
  it('does nothing at all while it is switched off', async () => {
    const { service, prisma, google } = build({ enabled: false, shifts: [SHIFT] });
    await expect(service.sync({ now: NOW })).resolves.toEqual({
      sent: 0,
      cancelled: 0,
      failed: 0,
      remaining: 0,
    });
    expect(prisma.shift.findMany).not.toHaveBeenCalled();
    expect(google.put).not.toHaveBeenCalled();
  });

  describe('what should be on calendars', () => {
    it('asks for published shifts somebody is on, in the next two weeks', async () => {
      const { service, prisma } = build();
      await service.wanted(NOW);
      const where = prisma.shift.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        status: ShiftStatus.PUBLISHED,
        employeeId: { not: null },
        endsAt: { gt: NOW },
      });
      expect(where.startsAt.lt.getTime() - NOW.getTime()).toBe(SHIFT_INVITE_DAYS * 86_400_000);
    });

    it('invites only the person on a shift', async () => {
      const { service } = build({ shifts: [SHIFT] });
      const [wanted] = await service.wanted(NOW);
      expect(wanted.body.attendees).toEqual([{ email: 'frankie@example.com' }]);
      expect(wanted.body.summary).toBe('Work — North Bergen');
      expect(wanted.body.location).toBe('1 Main St, North Bergen, NJ');
    });

    it('asks for events only, never closures', async () => {
      const { service, prisma } = build();
      await service.wanted(NOW);
      expect(prisma.practiceEvent.findMany.mock.calls[0][0].where.kind).toBe(
        PracticeEventKind.EVENT,
      );
    });

    it('invites everybody an event is for, and nobody else', async () => {
      const { service, prisma } = build({
        events: [MEETING],
        people: [{ email: 'b@example.com' }, { email: 'A@example.com' }],
      });
      const [wanted] = await service.wanted(NOW);
      // The same people the event is shown to in the app.
      expect(prisma.employee.findMany.mock.calls[0][0].where).toMatchObject({
        employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] },
      });
      expect(wanted.body.attendees).toEqual([
        { email: 'a@example.com' },
        { email: 'b@example.com' },
      ]);
    });

    it('skips an event nobody is left to go to', async () => {
      const { service } = build({ events: [MEETING], people: [] });
      await expect(service.wanted(NOW)).resolves.toEqual([]);
    });
  });

  describe('a round', () => {
    it('sends what is new and remembers it', async () => {
      const { service, google, prisma } = build({ shifts: [SHIFT] });
      await expect(service.sync({ now: NOW })).resolves.toMatchObject({ sent: 1, remaining: 0 });
      expect(google.put).toHaveBeenCalledWith(
        'shift11111111222243338444555555555555',
        expect.objectContaining({ summary: 'Work — North Bergen' }),
      );
      expect(prisma.calendarInvite.create.mock.calls[0][0].data).toMatchObject({
        kind: CalendarInviteKind.SHIFT,
        sourceId: SHIFT.id,
        googleEventId: 'shift11111111222243338444555555555555',
      });
    });

    it('sends nothing twice when two saves run at the same moment', async () => {
      const { service, google, prisma } = build({ shifts: [SHIFT] });
      // The other round claimed it first.
      prisma.calendarInvite.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate key', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.sync({ now: NOW })).resolves.toMatchObject({ sent: 0, remaining: 0 });
      expect(google.put).not.toHaveBeenCalled();
    });

    it('claims a changed invite only if nobody else has since', async () => {
      const { service, google, prisma } = build({
        shifts: [SHIFT],
        sent: [{ id: 'row-1', kind: 'SHIFT', sourceId: SHIFT.id, fingerprint: 'old' }],
      });
      prisma.calendarInvite.updateMany.mockResolvedValue({ count: 0 });
      await service.sync({ now: NOW });
      expect(prisma.calendarInvite.updateMany.mock.calls[0][0].where).toEqual({
        id: 'row-1',
        fingerprint: 'old',
      });
      expect(google.put).not.toHaveBeenCalled();
    });

    it('marks a failed send to be tried again', async () => {
      const { service, google, prisma } = build({ shifts: [SHIFT] });
      google.put.mockRejectedValue(new GoogleProblem('Backend Error', 500));
      await expect(service.sync({ now: NOW })).resolves.toMatchObject({ failed: 1, remaining: 1 });
      expect(prisma.calendarInvite.updateMany.mock.calls[0][0].data).toEqual({
        fingerprint: 'retry',
      });
    });

    it('does not send an unchanged shift again', async () => {
      const first = build({ shifts: [SHIFT] });
      const [wanted] = await first.service.wanted(NOW);
      const { service, google } = build({
        shifts: [SHIFT],
        sent: [{ kind: 'SHIFT', sourceId: SHIFT.id, fingerprint: wanted.fingerprint }],
      });
      await expect(service.sync({ now: NOW })).resolves.toMatchObject({ sent: 0, remaining: 0 });
      expect(google.put).not.toHaveBeenCalled();
    });

    it('sends a changed shift again', async () => {
      const { service, google } = build({
        shifts: [SHIFT],
        sent: [{ kind: 'SHIFT', sourceId: SHIFT.id, fingerprint: 'what it used to say' }],
      });
      await service.sync({ now: NOW });
      expect(google.put).toHaveBeenCalledTimes(1);
    });

    it('cancels an invite whose shift has gone, and forgets it', async () => {
      const { service, google, prisma } = build({
        sent: [
          {
            id: 'row-1',
            kind: 'SHIFT',
            sourceId: SHIFT.id,
            googleEventId: 'shiftabc',
            fingerprint: 'x',
            startsAt: SHIFT.startsAt,
          },
        ],
      });
      await expect(service.sync({ now: NOW })).resolves.toMatchObject({ cancelled: 1 });
      expect(google.cancel).toHaveBeenCalledWith('shiftabc');
      expect(prisma.calendarInvite.deleteMany).toHaveBeenCalledWith({ where: { id: 'row-1' } });
    });

    it('does as many as it is allowed, soonest first, and says how many are left', async () => {
      const later = {
        ...SHIFT,
        id: '22222222-2222-4333-8444-555555555555',
        startsAt: new Date('2026-10-05T12:00:00.000Z'),
      };
      const { service, google } = build({ shifts: [later, SHIFT] });
      await expect(service.sync({ now: NOW, budget: 1 })).resolves.toMatchObject({
        sent: 1,
        remaining: 1,
      });
      expect(google.put.mock.calls[0][0]).toBe(googleEventIdOf(CalendarInviteKind.SHIFT, SHIFT.id));
    });

    it('stops asking once Google refuses, and says why', async () => {
      const shifts = Array.from({ length: 10 }, (_, i) => ({
        ...SHIFT,
        id: `${i}1111111-2222-4333-8444-555555555555`,
      }));
      const { service, google, prisma } = build({ shifts });
      google.put.mockRejectedValue(new GoogleProblem('the Workspace admin has not allowed it yet'));
      const result = await service.sync({ now: NOW });
      // At most one call per worker before they all stop.
      expect(google.put.mock.calls.length).toBeLessThanOrEqual(4);
      expect(result).toMatchObject({ sent: 0, remaining: 10 });
      expect(prisma.googleCalendar.upsert.mock.calls[0][0].update).toMatchObject({
        lastError: 'the Workspace admin has not allowed it yet',
      });
    });

    it('never fails the save it follows', async () => {
      const { service, prisma } = build();
      prisma.shift.findMany.mockRejectedValue(new Error('database away'));
      await expect(service.syncQuietly()).resolves.toBeUndefined();
    });
  });
});

describe('what an invite says', () => {
  it('uses ids Google accepts: 0-9 and a-v only', () => {
    const id = googleEventIdOf(CalendarInviteKind.EVENT, MEETING.id);
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it('puts a work-from-home shift nowhere', () => {
    const body = shiftInvite({ ...SHIFT, isRemote: true }, 'a@example.com');
    expect(body.summary).toBe('Work from home');
    expect(body.location).toBeUndefined();
  });

  it('puts the video link first, where every calendar makes it tappable', () => {
    const body = eventInvite(MEETING as never, ['a@example.com']);
    expect(
      body.description?.startsWith('Join the video call: https://meet.google.com/abc-defg-hij'),
    ).toBe(true);
    expect(body.location).toBe('https://meet.google.com/abc-defg-hij');
    expect(body.start).toEqual({
      dateTime: '2026-10-09T13:00:00.000Z',
      timeZone: 'America/New_York',
    });
  });

  it('gives an all-day event Google’s end: the day after the last', () => {
    const body = eventInvite(
      {
        ...MEETING,
        allDay: true,
        // The 15th and 16th in New Jersey.
        startsAt: new Date('2026-10-15T04:00:00.000Z'),
        endsAt: new Date('2026-10-17T04:00:00.000Z'),
      } as never,
      ['a@example.com'],
    );
    expect(body.start).toEqual({ date: '2026-10-15' });
    expect(body.end).toEqual({ date: '2026-10-17' });
    expect(body.transparency).toBe('transparent');
  });
});
