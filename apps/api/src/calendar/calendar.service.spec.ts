import { NotFoundException } from '@nestjs/common';
import { PtoStatus, ShiftStatus } from '@prisma/client';
import { fakeSettings } from '../settings/practice-settings.test-double';
import { CalendarService } from './calendar.service';

const NOW = new Date('2026-09-22T10:00:00.000Z');

describe('CalendarService', () => {
  function build(
    options: {
      employee?: unknown;
      shifts?: unknown[];
      timeOff?: unknown[];
      events?: unknown[];
      invitesOn?: boolean;
      payPeriodStart?: Date | null;
    } = {},
  ) {
    const prisma = {
      employee: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          calendarToken: 'existing-token',
          calendarTokenSetAt: NOW,
        }),
        findUnique: jest.fn().mockResolvedValue(
          'employee' in options
            ? options.employee
            : {
                id: 'emp-1',
                firstName: 'Frankie',
                preferredName: null,
                lastName: 'Front-Desk',
                employmentStatus: 'ACTIVE',
              },
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      shift: { findMany: jest.fn().mockResolvedValue(options.shifts ?? []) },
      ptoRequest: { findMany: jest.fn().mockResolvedValue(options.timeOff ?? []) },
    };
    const events = { forPerson: jest.fn().mockResolvedValue(options.events ?? []) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invites = { enabled: options.invitesOn ?? false };
    return {
      service: new CalendarService(
        prisma as never,
        events as never,
        invites as never,
        fakeSettings({ payPeriodStart: options.payPeriodStart ?? null }),
      ),
      prisma,
      events,
    };
  }

  const shift = {
    id: 'sh-1',
    startsAt: new Date('2026-09-23T13:00:00.000Z'),
    endsAt: new Date('2026-09-23T21:00:00.000Z'),
    notes: null,
    updatedAt: new Date('2026-09-20T09:00:00.000Z'),
    location: {
      name: 'North Bergen',
      addressLine1: '7650 Bergenline Ave',
      city: 'North Bergen',
      state: 'NJ',
    },
  };

  describe('the link', () => {
    it('reports an existing token', async () => {
      const { service } = build();
      await expect(service.currentToken('emp-1')).resolves.toMatchObject({
        token: 'existing-token',
      });
    });

    it('issues a long random token', async () => {
      const { service, prisma } = build();
      const { token } = await service.issueToken('emp-1');
      // 24 bytes, base64url.
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(prisma.employee.update.mock.calls[0][0].data.calendarToken).toBe(token);
    });

    it('issues a different token each time, so regenerating really rotates', async () => {
      const { service } = build();
      const first = await service.issueToken('emp-1');
      const second = await service.issueToken('emp-1');
      expect(first.token).not.toBe(second.token);
    });

    it('clears the token on revoke', async () => {
      const { service, prisma } = build();
      await service.revokeToken('emp-1');
      expect(prisma.employee.update.mock.calls[0][0].data).toEqual({
        calendarToken: null,
        calendarTokenSetAt: null,
      });
    });
  });

  describe('the feed', () => {
    it('is not found for an unknown token', async () => {
      const { service } = build({ employee: null });
      await expect(service.feedForToken('nope', NOW)).rejects.toThrow(NotFoundException);
    });

    it('stops working for a former employee', async () => {
      const { service } = build({
        employee: {
          id: 'emp-1',
          firstName: 'Frankie',
          preferredName: null,
          lastName: 'Front-Desk',
          employmentStatus: 'TERMINATED',
        },
      });
      await expect(service.feedForToken('token', NOW)).rejects.toThrow(NotFoundException);
    });

    it('looks up the employee by the token, not by id', async () => {
      const { service, prisma } = build();
      await service.feedForToken('some-token', NOW);
      expect(prisma.employee.findUnique.mock.calls[0][0].where).toEqual({
        calendarToken: 'some-token',
      });
    });

    it('publishes only published shifts, never drafts', async () => {
      const { service, prisma } = build();
      await service.feedForToken('token', NOW);
      expect(prisma.shift.findMany.mock.calls[0][0].where.status).toBe(ShiftStatus.PUBLISHED);
    });

    it('publishes only approved time off', async () => {
      const { service, prisma } = build();
      await service.feedForToken('token', NOW);
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.status).toBe(PtoStatus.APPROVED);
    });

    it('scopes both queries to this employee', async () => {
      const { service, prisma } = build();
      await service.feedForToken('token', NOW);
      expect(prisma.shift.findMany.mock.calls[0][0].where.employeeId).toBe('emp-1');
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.employeeId).toBe('emp-1');
    });

    it('bounds the window rather than publishing all history', async () => {
      const { service, prisma } = build();
      await service.feedForToken('token', NOW);
      const range = prisma.shift.findMany.mock.calls[0][0].where.startsAt;
      expect(range.gte.getTime()).toBeLessThan(NOW.getTime());
      expect(range.lte.getTime()).toBeGreaterThan(NOW.getTime());
    });

    it('renders a shift as a timed event with its address', async () => {
      const { service } = build({ shifts: [shift] });
      const feed = await service.feedForToken('token', NOW);

      expect(feed).toContain('SUMMARY:Work — North Bergen');
      expect(feed).toContain('DTSTART:20260923T130000Z');
      expect(feed).toContain('DTEND:20260923T210000Z');
      expect(feed).toContain('LOCATION:7650 Bergenline Ave\\, North Bergen\\, NJ');
    });

    it('gives a shift a UID that survives an edit', async () => {
      const { service } = build({ shifts: [shift] });
      const first = await service.feedForToken('token', NOW);

      const edited = { ...shift, endsAt: new Date('2026-09-23T22:00:00.000Z'), updatedAt: NOW };
      const { service: second } = build({ shifts: [edited] });
      const again = await second.feedForToken('token', NOW);

      // Same UID, so calendars replace rather than duplicate…
      expect(first).toContain('UID:shift-sh-1@staff.domihealthcare.com');
      expect(again).toContain('UID:shift-sh-1@staff.domihealthcare.com');
      // …and a higher SEQUENCE, so they accept the newer version.
      const sequenceOf = (feed: string) => Number(/SEQUENCE:(\d+)/.exec(feed)![1]);
      expect(sequenceOf(again)).toBeGreaterThan(sequenceOf(first));
    });

    it('renders approved time off as a transparent all-day event', async () => {
      const { service } = build({
        timeOff: [
          {
            id: 'pto-1',
            type: 'VACATION',
            startDate: new Date('2026-11-03T00:00:00.000Z'),
            endDate: new Date('2026-11-07T00:00:00.000Z'),
            isHalfDay: false,
            updatedAt: NOW,
          },
        ],
      });
      const feed = await service.feedForToken('token', NOW);

      expect(feed).toContain('SUMMARY:Vacation');
      expect(feed).toContain('DTSTART;VALUE=DATE:20261103');
      expect(feed).toContain('DTEND;VALUE=DATE:20261108');
      // Time off should not make the person look busy.
      expect(feed).toContain('TRANSP:TRANSPARENT');
    });

    it('marks a half day as such', async () => {
      const { service } = build({
        timeOff: [
          {
            id: 'pto-2',
            type: 'PERSONAL',
            startDate: new Date('2026-11-03T00:00:00.000Z'),
            endDate: new Date('2026-11-03T00:00:00.000Z'),
            isHalfDay: true,
            updatedAt: NOW,
          },
        ],
      });
      expect(await service.feedForToken('token', NOW)).toContain('SUMMARY:Personal (half day)');
    });

    it('names the calendar after the employee, preferring a preferred name', async () => {
      const { service } = build({
        employee: {
          id: 'emp-1',
          firstName: 'Frankie',
          preferredName: 'Frank',
          lastName: 'Front-Desk',
          employmentStatus: 'ACTIVE',
        },
      });
      expect(await service.feedForToken('token', NOW)).toContain(
        'X-WR-CALNAME:Frank Front-Desk — Domi Staff',
      );
    });

    it('returns a valid empty calendar for someone with nothing scheduled', async () => {
      const { service } = build();
      const feed = await service.feedForToken('token', NOW);
      expect(feed).toContain('BEGIN:VCALENDAR');
      expect(feed).toContain('END:VCALENDAR');
      expect(feed).not.toContain('BEGIN:VEVENT');
    });

    it('includes both shifts and time off together', async () => {
      const { service } = build({
        shifts: [shift],
        timeOff: [
          {
            id: 'pto-1',
            type: 'SICK',
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-01T00:00:00.000Z'),
            isHalfDay: false,
            updatedAt: NOW,
          },
        ],
      });
      const feed = await service.feedForToken('token', NOW);
      expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    });
  });

  describe('practice events', () => {
    const meeting = {
      id: 'ev-1',
      kind: 'EVENT',
      title: 'Office meeting',
      description: 'Bring your questions about the new phones.',
      place: 'North Bergen office — break room',
      allDay: false,
      startsAt: new Date('2026-10-14T16:30:00.000Z'),
      endsAt: new Date('2026-10-14T17:30:00.000Z'),
      updatedAt: new Date('2026-09-20T09:00:00.000Z'),
    };

    it('asks only for the events this person is invited to, in the same window', async () => {
      const { service, events } = build();
      await service.feedForToken('token', NOW);
      const [who, from, to] = events.forPerson.mock.calls[0];
      expect(who).toBe('emp-1');
      expect(to.getTime() - from.getTime()).toBe((60 + 365) * 86_400_000);
    });

    it('puts a meeting on the phone as a timed event with its place', async () => {
      const { service } = build({ events: [meeting] });
      const feed = await service.feedForToken('token', NOW);
      expect(feed).toContain('UID:event-ev-1@staff.domihealthcare.com');
      expect(feed).toContain('SUMMARY:Office meeting');
      expect(feed).toContain('DTSTART:20261014T163000Z');
      expect(feed).toContain('DTEND:20261014T173000Z');
      expect(feed).toContain('LOCATION:North Bergen office — break room');
      expect(feed).toContain('DESCRIPTION:Bring your questions about the new phones.');
      expect(feed).toContain('TRANSP:OPAQUE');
    });

    it('puts an all-day event on its own days, on the practice clock', async () => {
      const { service } = build({
        events: [
          {
            ...meeting,
            id: 'ev-2',
            title: 'Wellness day',
            place: null,
            description: null,
            allDay: true,
            // Midnight in New Jersey on the 15th to midnight after the 16th.
            startsAt: new Date('2026-10-15T04:00:00.000Z'),
            endsAt: new Date('2026-10-17T04:00:00.000Z'),
          },
        ],
      });
      const feed = await service.feedForToken('token', NOW);
      expect(feed).toContain('DTSTART;VALUE=DATE:20261015');
      // Exclusive, as iCalendar wants: the day after the last one.
      expect(feed).toContain('DTEND;VALUE=DATE:20261017');
      expect(feed).toContain('TRANSP:TRANSPARENT');
      expect(feed).not.toContain('LOCATION:');
    });

    it('puts a video call link where every calendar app can tap it', async () => {
      const { service } = build({
        events: [{ ...meeting, place: null, meetingUrl: 'https://meet.google.com/abc-defg-hij' }],
      });
      // Unfolded: long lines are split at 75 octets, as iCalendar requires.
      const feed = (await service.feedForToken('token', NOW)).replace(/\r\n /g, '');
      expect(feed).toContain('URL:https://meet.google.com/abc-defg-hij');
      // Google Calendar ignores URL, so it leads the notes too, and stands in
      // for the place when there is none.
      expect(feed).toContain(
        'DESCRIPTION:Join the video call: https://meet.google.com/abc-defg-hij\\n\\nBring your',
      );
      expect(feed).toContain('LOCATION:https://meet.google.com/abc-defg-hij');
    });

    it('names a closure as one, and does not make anybody look busy', async () => {
      const { service } = build({
        events: [
          {
            ...meeting,
            id: 'ev-3',
            kind: 'CLOSURE',
            title: 'Christmas Eve',
            place: null,
            description: null,
            audience: 'LOCATION',
            location: { id: 'loc-nb', name: 'North Bergen' },
            startsAt: new Date('2026-12-24T18:00:00.000Z'),
            endsAt: new Date('2026-12-25T05:00:00.000Z'),
          },
        ],
      });
      const feed = await service.feedForToken('token', NOW);
      expect(feed).toContain('SUMMARY:North Bergen closed: Christmas Eve');
      expect(feed).toContain('TRANSP:TRANSPARENT');
    });

    it('names a diagnostics date with its office, at the office address, not busy', async () => {
      const { service } = build({
        events: [
          {
            ...meeting,
            id: 'ev-4',
            kind: 'DIAGNOSTIC',
            title: 'US + ECHO',
            place: null,
            description: null,
            audience: 'EVERYONE',
            atLocation: {
              id: 'loc-wny',
              name: 'West New York',
              addressLine1: '5901 Bergenline Ave',
              city: 'West New York',
              state: 'NJ',
            },
            startsAt: new Date('2026-11-08T13:00:00.000Z'),
            endsAt: new Date('2026-11-08T19:00:00.000Z'),
          },
        ],
      });
      const feed = await service.feedForToken('token', NOW);
      expect(feed).toContain('SUMMARY:US + ECHO — West New York');
      expect(feed).toContain('LOCATION:5901 Bergenline Ave\\, West New York\\, NJ');
      expect(feed).toContain('TRANSP:TRANSPARENT');
    });
  });

  describe('rep lunches', () => {
    it('names the rep, company and office, says what to expect, and keeps the managers’ notes off', async () => {
      const { service } = build({
        events: [
          {
            id: 'ev-9',
            kind: 'REP_LUNCH',
            title: 'Rep lunch: Jane Smith',
            description: null,
            place: null,
            meetingUrl: null,
            allDay: false,
            audience: 'EVERYONE',
            location: null,
            atLocation: {
              id: 'loc-nb',
              name: 'North Bergen',
              addressLine1: '7650 Bergenline Ave',
              city: 'North Bergen',
              state: 'NJ',
            },
            rep: {
              id: 'rep-jane',
              name: 'Jane Smith',
              company: 'Novo Nordisk',
              medication: 'Ozempic',
              food: 'SELF_ORDER',
              cellPhone: '(201) 555-0142',
              status: 'RESTRICTED',
              notes: 'Only Tuesdays',
            },
            startsAt: new Date('2026-11-10T16:30:00.000Z'),
            endsAt: new Date('2026-11-10T17:30:00.000Z'),
            updatedAt: NOW,
          },
        ],
      });
      const feed = (await service.feedForToken('token', NOW)).replace(/\r\n /g, '');
      expect(feed).toContain('SUMMARY:Rep lunch: Jane Smith (Novo Nordisk) — North Bergen');
      expect(feed).toContain('Medication: Ozempic');
      expect(feed).toContain('Lunch: the office orders');
      expect(feed).not.toContain('555-0142');
      expect(feed).not.toContain('Only Tuesdays');
    });
  });

  describe('pay days', () => {
    it('puts the Friday after each pay period on the phone, all day', async () => {
      // Periods start on Sundays from 18 October 2026: paid 6 November, 20 November…
      const { service } = build({ payPeriodStart: new Date('2026-10-18T00:00:00.000Z') });
      const feed = await service.feedForToken('token', NOW);
      expect(feed).toContain('UID:payday-2026-11-06@staff.domihealthcare.com');
      expect(feed).toContain('SUMMARY:Pay day');
      expect(feed).toContain('DTSTART;VALUE=DATE:20261106');
      expect(feed).toContain('DTEND;VALUE=DATE:20261107');
      expect(feed).not.toContain('payday-2026-11-13');
    });

    it('has none until a pay period is set', async () => {
      const { service } = build();
      expect(await service.feedForToken('token', NOW)).not.toContain('Pay day');
    });

    it('refuses a backwards or very long range', async () => {
      const { service } = build();
      await expect(service.payDays('2026-12-01', '2026-11-01')).rejects.toThrow();
      await expect(service.payDays('2026-01-01', '2028-01-01')).rejects.toThrow();
    });
  });

  describe('once shifts and events go out as invites', () => {
    it('keeps only closures and time off, so nothing shows twice', async () => {
      const { service, prisma } = build({
        invitesOn: true,
        shifts: [shift],
        timeOff: [
          {
            id: 'pto-1',
            type: 'VACATION',
            startDate: new Date('2026-10-05T00:00:00.000Z'),
            endDate: new Date('2026-10-06T00:00:00.000Z'),
            isHalfDay: false,
            updatedAt: NOW,
          },
        ],
        events: [
          {
            id: 'ev-1',
            kind: 'EVENT',
            title: 'Office meeting',
            description: null,
            place: 'Break room',
            meetingUrl: null,
            allDay: false,
            audience: 'EVERYONE',
            location: null,
            startsAt: new Date('2026-10-02T13:00:00.000Z'),
            endsAt: new Date('2026-10-02T14:00:00.000Z'),
            updatedAt: NOW,
          },
          {
            id: 'ev-2',
            kind: 'CLOSURE',
            title: 'Christmas Day',
            description: null,
            place: null,
            meetingUrl: null,
            allDay: true,
            audience: 'EVERYONE',
            location: null,
            startsAt: new Date('2026-12-25T05:00:00.000Z'),
            endsAt: new Date('2026-12-26T05:00:00.000Z'),
            updatedAt: NOW,
          },
          {
            id: 'ev-3',
            kind: 'DIAGNOSTIC',
            title: 'US + ECHO',
            description: null,
            place: null,
            meetingUrl: null,
            allDay: false,
            audience: 'EVERYONE',
            location: null,
            atLocation: {
              id: 'loc-nb',
              name: 'North Bergen',
              addressLine1: '7650 Bergenline Ave',
              city: 'North Bergen',
              state: 'NJ',
            },
            startsAt: new Date('2026-11-15T13:00:00.000Z'),
            endsAt: new Date('2026-11-15T19:00:00.000Z'),
            updatedAt: NOW,
          },
        ],
      });
      const feed = await service.feedForToken('token', NOW);
      expect(prisma.shift.findMany).not.toHaveBeenCalled();
      expect(feed).not.toContain('Office meeting');
      expect(feed).toContain('SUMMARY:Closed: Christmas Day');
      // Invites carry meetings only; the diagnostics schedule stays here.
      expect(feed).toContain('SUMMARY:US + ECHO — North Bergen');
      expect(feed).toContain('SUMMARY:Vacation');
      // Said at the top of the calendar, for anybody who wonders where they went.
      expect(feed).toContain('Office closures and approved time off');
    });
  });
});
