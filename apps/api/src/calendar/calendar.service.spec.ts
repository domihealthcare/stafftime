import { NotFoundException } from '@nestjs/common';
import { PtoStatus, ShiftStatus } from '@prisma/client';
import { CalendarService } from './calendar.service';

const NOW = new Date('2026-09-22T10:00:00.000Z');

describe('CalendarService', () => {
  function build(
    options: {
      employee?: unknown;
      shifts?: unknown[];
      timeOff?: unknown[];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new CalendarService(prisma as any), prisma };
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
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.status).toBe(
        PtoStatus.APPROVED,
      );
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
      expect(await service.feedForToken('token', NOW)).toContain(
        'SUMMARY:Personal (half day)',
      );
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
        'X-WR-CALNAME:Frank Front-Desk — Domi',
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
});
