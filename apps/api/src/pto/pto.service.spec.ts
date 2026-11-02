import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, PtoStatus, PtoType, Role } from '@prisma/client';
import { countDays, isoDate } from '../common/util/calendar-date.util';
import { countedDateList, countedDays } from './counted-days';
import { PtoService } from './pto.service';

describe('date helpers', () => {
  it('counts inclusive days', () => {
    const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
    expect(countDays(day('2026-11-03'), day('2026-11-03'))).toBe(1);
    expect(countDays(day('2026-11-03'), day('2026-11-07'))).toBe(5);
  });

  it('counts across a daylight-saving boundary without drifting', () => {
    const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
    // US clocks change on 2026-11-01.
    expect(countDays(day('2026-10-30'), day('2026-11-03'))).toBe(5);
  });

  it('renders a date without a timezone shifting it', () => {
    expect(isoDate(new Date('2026-11-03T00:00:00.000Z'))).toBe('2026-11-03');
  });
});

describe('PtoService', () => {
  const employee: { id: string; email: string; role: Role } = {
    id: 'emp-1',
    email: 'frankie@domihealthcare.com',
    role: Role.EMPLOYEE,
  };
  const manager = { id: 'mgr-1', email: 'morgan@domihealthcare.com', role: Role.MANAGER };

  function build(
    options: {
      employee?: unknown;
      overlap?: unknown;
      request?: unknown;
      shifts?: unknown[];
      /// What is left of the allowance a request draws on, before it.
      remaining?: number;
      /// What approving would split off past the balance.
      split?: unknown;
    } = {},
  ) {
    const prisma = {
      employee: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            options.employee === undefined
              ? { id: 'emp-1', employmentStatus: 'ACTIVE', firstName: 'Frankie' }
              : options.employee,
          ),
      },
      ptoRequest: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'pto-1',
          ...data,
          isHalfDay: data.isHalfDay ?? false,
        })),
        findFirst: jest.fn().mockResolvedValue(options.overlap ?? null),
        findUnique: jest.fn().mockResolvedValue(options.request ?? null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: 'pto-1',
          employeeId: 'emp-1',
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-05T00:00:00.000Z'),
          isHalfDay: false,
          ...data,
        })),
        count: jest.fn().mockResolvedValue(3),
        delete: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }) => ({
          id: where.id,
          employeeId: 'emp-1',
          status: PtoStatus.APPROVED,
          type: PtoType.SICK,
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-04T00:00:00.000Z'),
          isHalfDay: false,
        })),
      },
      ptoChange: {
        create: jest.fn().mockResolvedValue({ id: 'change-1' }),
      },
      shift: {
        findMany: jest.fn().mockResolvedValue(options.shifts ?? []),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    // Notifications are fire and forget, so the double only has to not throw.
    const notifications = {
      ptoRequested: jest.fn().mockResolvedValue(undefined),
      ptoDecided: jest.fn().mockResolvedValue(undefined),
      ptoChanged: jest.fn().mockResolvedValue(undefined),
    };
    // Counting by the real rule (weekdays), with no closures; the balance as given.
    const days = {
      counterFor: jest.fn(
        async () => (r: Parameters<typeof countedDays>[0]) => countedDays(r, new Set()),
      ),
      approvalSplits: jest.fn(async (requests: unknown[]) =>
        requests.map(() => options.split ?? null),
      ),
      datesFor: jest.fn(
        async () => (r: { startDate: Date; endDate: Date }) => countedDateList(r, new Set()),
      ),
      preview: jest.fn(async (r: Parameters<typeof countedDays>[0]) => {
        const taken = countedDays(r, new Set());
        const remaining = options.remaining ?? 10;
        return {
          days: taken,
          bucket: 'vacation',
          inOneYear: true,
          remaining,
          after: remaining - taken,
        };
      }),
    };
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: new PtoService(prisma as any, notifications as any, days as any),
      days,
      prisma,
      notifications,
    };
  }

  describe('telling people', () => {
    it('tells the managers when somebody asks for time off', async () => {
      const { service, notifications } = build();
      await service.create(
        { type: PtoType.VACATION, startDate: '2026-11-03', endDate: '2026-11-05' },
        employee,
      );

      expect(notifications.ptoRequested).toHaveBeenCalledWith('pto-1');
    });

    it('tells the employee when it is decided', async () => {
      const { service, notifications } = build({
        request: {
          id: 'pto-1',
          employeeId: 'emp-1',
          status: PtoStatus.PENDING,
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-05T00:00:00.000Z'),
        },
      });
      await service.review('pto-1', { decision: PtoStatus.APPROVED }, manager);

      expect(notifications.ptoDecided).toHaveBeenCalledWith('pto-1', 0);
    });

    it('does not let a failed notification fail the request itself', async () => {
      // An approval that errored because a mail server hiccuped would be a far
      // worse bug than a missing email.
      const { service, notifications } = build();
      notifications.ptoRequested.mockRejectedValue(new Error('mail server down'));

      await expect(
        service.create(
          { type: PtoType.VACATION, startDate: '2026-11-03', endDate: '2026-11-05' },
          employee,
        ),
      ).resolves.toBeDefined();
    });
  });

  const request = (overrides: Record<string, unknown> = {}) => ({
    type: PtoType.VACATION,
    startDate: '2026-11-03',
    endDate: '2026-11-05',
    ...overrides,
  });

  describe('creating a request', () => {
    it('records the dates as whole days', async () => {
      const { service } = build();
      const created = await service.create(request(), employee);
      expect(created.startDate).toBe('2026-11-03');
      expect(created.endDate).toBe('2026-11-05');
      expect(created.days).toBe(3);
    });

    it('accepts a single day', async () => {
      const { service } = build();
      const created = await service.create(
        request({ startDate: '2026-11-03', endDate: '2026-11-03' }),
        employee,
      );
      expect(created.days).toBe(1);
    });

    it('counts a half day as half', async () => {
      const { service } = build();
      const created = await service.create(
        request({ startDate: '2026-11-03', endDate: '2026-11-03', isHalfDay: true }),
        employee,
      );
      expect(created.days).toBe(0.5);
    });

    it('counts weekdays only: Friday to Monday is two days', async () => {
      const { service } = build();
      const created = await service.create(
        request({ startDate: '2026-11-06', endDate: '2026-11-09' }),
        employee,
      );
      expect(created.days).toBe(2);
    });

    it('refuses more than is left until they say the rest may be unpaid', async () => {
      const { service, prisma } = build({ remaining: 2 });
      await expect(service.create(request(), employee)).rejects.toThrow(/may be unpaid/);
      expect(prisma.ptoRequest.create).not.toHaveBeenCalled();

      await service.create(request({ acknowledgedUnpaid: true }), employee);
      expect(prisma.ptoRequest.create.mock.calls[0][0].data.pastBalance).toBe(true);
    });

    it('marks nothing when it fits', async () => {
      const { service, prisma } = build({ remaining: 3 });
      await service.create(request(), employee);
      expect(prisma.ptoRequest.create.mock.calls[0][0].data.pastBalance).toBe(false);
    });

    it('refuses a half day spanning more than one date', async () => {
      const { service } = build();
      await expect(service.create(request({ isHalfDay: true }), employee)).rejects.toThrow(
        /single date/,
      );
    });

    it('refuses an end before the start', async () => {
      const { service } = build();
      await expect(
        service.create(request({ startDate: '2026-11-05', endDate: '2026-11-03' }), employee),
      ).rejects.toThrow(/cannot be before/);
    });

    it('refuses an implausibly long request rather than accepting a typo', async () => {
      const { service } = build();
      await expect(
        service.create(request({ startDate: '2026-11-03', endDate: '2027-11-03' }), employee),
      ).rejects.toThrow(/Split a request/);
    });

    it('refuses an overlap with an existing request, and says which', async () => {
      const { service } = build({
        overlap: {
          id: 'pto-0',
          startDate: new Date('2026-11-04T00:00:00.000Z'),
          endDate: new Date('2026-11-06T00:00:00.000Z'),
          status: PtoStatus.APPROVED,
        },
      });
      await expect(service.create(request(), employee)).rejects.toThrow(
        /overlaps an approved request from 2026-11-04 to 2026-11-06/,
      );
    });

    it('only considers pending and approved requests an overlap', async () => {
      const { service, prisma } = build();
      await service.create(request(), employee);
      expect(prisma.ptoRequest.findFirst.mock.calls[0][0].where.status).toEqual({
        in: [PtoStatus.PENDING, PtoStatus.APPROVED],
      });
    });

    it('refuses a terminated employee', async () => {
      const { service } = build({
        employee: { id: 'emp-1', employmentStatus: 'TERMINATED', firstName: 'Frankie' },
      });
      await expect(service.create(request(), employee)).rejects.toThrow(ForbiddenException);
    });

    it('stops an employee filing for somebody else', async () => {
      const { service } = build();
      await expect(service.create(request({ employeeId: 'emp-2' }), employee)).rejects.toThrow(
        /only request time off for yourself/,
      );
    });

    it('lets a manager file on behalf of someone who phoned in sick', async () => {
      const { service, prisma } = build();
      await service.create(request({ employeeId: 'emp-1', type: PtoType.SICK }), manager);
      expect(prisma.ptoRequest.create.mock.calls[0][0].data.employeeId).toBe('emp-1');
    });
  });

  describe('reviewing', () => {
    const pending = {
      id: 'pto-1',
      employeeId: 'emp-1',
      status: PtoStatus.PENDING,
      startDate: new Date('2026-11-03T00:00:00.000Z'),
      endDate: new Date('2026-11-05T00:00:00.000Z'),
    };

    it('approves and records who decided', async () => {
      const { service, prisma } = build({ request: pending });
      await service.review('pto-1', { decision: PtoStatus.APPROVED }, manager);

      const data = prisma.ptoRequest.update.mock.calls[0][0].data;
      expect(data.status).toBe(PtoStatus.APPROVED);
      expect(data.reviewedById).toBe('mgr-1');
      expect(data.reviewedAt).toBeInstanceOf(Date);
    });

    describe('their shifts in those days', () => {
      const shifts = [
        { id: 'shift-draft', status: 'DRAFT' },
        { id: 'shift-live', status: 'PUBLISHED' },
      ];

      it('are left alone unless the manager chooses', async () => {
        const { service, prisma, notifications } = build({ request: pending, shifts });
        await service.review('pto-1', { decision: PtoStatus.APPROVED }, manager);
        expect(prisma.shift.findMany).not.toHaveBeenCalled();
        expect(notifications.ptoDecided).toHaveBeenCalledWith('pto-1', 0);
      });

      it('come off the rota: a draft deleted, a published one cancelled, and the person told', async () => {
        const { service, prisma, notifications } = build({ request: pending, shifts });
        await service.review('pto-1', { decision: PtoStatus.APPROVED, shifts: 'REMOVE' }, manager);
        expect(prisma.shift.findMany.mock.calls[0][0].where).toMatchObject({
          employeeId: 'emp-1',
          status: { not: 'CANCELLED' },
        });
        expect(prisma.shift.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: ['shift-draft'] } },
        });
        expect(prisma.shift.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['shift-draft', 'shift-live'] }, status: { not: 'DRAFT' } },
          data: { status: 'CANCELLED' },
        });
        expect(notifications.ptoDecided).toHaveBeenCalledWith('pto-1', 2);
      });

      it('or stay as open shifts for somebody else, no longer part of their regular shift', async () => {
        const { service, prisma } = build({ request: pending, shifts });
        await service.review('pto-1', { decision: PtoStatus.APPROVED, shifts: 'OPEN' }, manager);
        expect(prisma.shift.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['shift-draft', 'shift-live'] } },
          data: { employeeId: null, seriesId: null },
        });
        expect(prisma.shift.deleteMany).not.toHaveBeenCalled();
      });

      it('stay for a half day, and are never touched by a refusal', async () => {
        const half = build({
          request: { ...pending, endDate: pending.startDate, isHalfDay: true },
          shifts,
        });
        await half.service.review(
          'pto-1',
          { decision: PtoStatus.APPROVED, shifts: 'REMOVE' },
          manager,
        );
        expect(half.prisma.shift.updateMany).not.toHaveBeenCalled();

        const denied = build({ request: pending, shifts });
        await denied.service.review(
          'pto-1',
          { decision: PtoStatus.DENIED, reviewNote: 'Short that week', shifts: 'REMOVE' },
          manager,
        );
        expect(denied.prisma.shift.findMany).not.toHaveBeenCalled();
      });
    });

    it('requires a reason to deny', async () => {
      const { service } = build({ request: pending });
      await expect(
        service.review('pto-1', { decision: PtoStatus.DENIED }, manager),
      ).rejects.toThrow(/Give a reason/);
    });

    it('denies with a reason', async () => {
      const { service, prisma } = build({ request: pending });
      await service.review(
        'pto-1',
        { decision: PtoStatus.DENIED, reviewNote: 'Both MAs are already off that week' },
        manager,
      );
      expect(prisma.ptoRequest.update.mock.calls[0][0].data.reviewNote).toBe(
        'Both MAs are already off that week',
      );
    });

    it('refuses to let a manager decide their own request', async () => {
      const { service } = build({ request: { ...pending, employeeId: 'mgr-1' } });
      await expect(
        service.review('pto-1', { decision: PtoStatus.APPROVED }, manager),
      ).rejects.toThrow(/cannot decide your own/);
    });

    it('refuses a second decision on the same request', async () => {
      const { service } = build({ request: { ...pending, status: PtoStatus.APPROVED } });
      await expect(
        service.review('pto-1', { decision: PtoStatus.DENIED, reviewNote: 'x' }, manager),
      ).rejects.toThrow(/already been approved/);
    });

    it('refuses the slower of two managers deciding at once', async () => {
      const { service, prisma } = build({ request: pending });
      // Read as pending by both; the write only matches while it still is.
      prisma.ptoRequest.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('No record found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.review('pto-1', { decision: PtoStatus.APPROVED }, manager),
      ).rejects.toThrow(/Somebody else has just decided/);
      expect(prisma.ptoRequest.update.mock.calls[0][0].where).toEqual({
        id: 'pto-1',
        status: PtoStatus.PENDING,
      });
    });

    it('rejects a decision that is not approve or deny', async () => {
      const { service } = build({ request: pending });
      await expect(
        service.review('pto-1', { decision: PtoStatus.CANCELLED }, manager),
      ).rejects.toThrow(/must be APPROVED or DENIED/);
    });
  });

  describe('editing', () => {
    const approved = {
      id: 'pto-1',
      employeeId: 'emp-1',
      status: PtoStatus.APPROVED,
      type: PtoType.VACATION,
      startDate: new Date('2026-11-03T00:00:00.000Z'),
      endDate: new Date('2026-11-04T00:00:00.000Z'),
      isHalfDay: false,
      unpaidPastBalanceOf: null,
    };

    it('lets a manager turn somebody else’s PTO into Sick, even for days gone by, and keeps who did', async () => {
      const { service, prisma, notifications } = build({ request: approved });
      await service.edit('pto-1', { type: PtoType.SICK, note: 'Was sick, not PTO' }, manager);
      expect(prisma.ptoRequest.update.mock.calls[0][0].data.type).toBe(PtoType.SICK);
      expect(prisma.ptoChange.create).toHaveBeenCalledWith({
        data: {
          requestId: 'pto-1',
          changedById: 'mgr-1',
          summary: 'Kind: Sick (was PTO)',
          note: 'Was sick, not PTO',
        },
        select: { id: true },
      });
      // The person is told.
      expect(notifications.ptoChanged).toHaveBeenCalledWith('change-1');
    });

    it('moves the dates, says what they were, and checks for an overlap with anything but itself', async () => {
      const { service, prisma } = build({ request: approved });
      await service.edit('pto-1', { startDate: '2026-11-05', endDate: '2026-11-06' }, manager);
      const data = prisma.ptoRequest.update.mock.calls[0][0].data;
      expect(isoDate(data.startDate)).toBe('2026-11-05');
      expect(isoDate(data.endDate)).toBe('2026-11-06');
      expect(prisma.ptoChange.create.mock.calls[0][0].data.summary).toBe(
        'Dates: Thu, Nov 5 to Fri, Nov 6 (was Tue, Nov 3 to Wed, Nov 4)',
      );
      expect(prisma.ptoRequest.findFirst.mock.calls[0][0].where.id).toEqual({ notIn: ['pto-1'] });
    });

    it('takes a note on its own', async () => {
      const { service, prisma } = build({ request: approved });
      await service.edit('pto-1', { note: 'Spoke to her, all fine' }, manager);
      expect(prisma.ptoChange.create.mock.calls[0][0].data.summary).toBe('Note added');
    });

    it('turns an unpaid day back into paid sick time, and it is no longer past the balance', async () => {
      const { service, prisma } = build({
        request: { ...approved, type: PtoType.UNPAID, unpaidPastBalanceOf: PtoType.SICK },
      });
      await service.edit('pto-1', { type: PtoType.SICK }, manager);
      const data = prisma.ptoRequest.update.mock.calls[0][0].data;
      expect(data.type).toBe(PtoType.SICK);
      expect(data.unpaidPastBalanceOf).toBeNull();
    });

    it('refuses nothing changed, a half day over two dates, and an overlap', async () => {
      const same = build({ request: approved });
      await expect(same.service.edit('pto-1', { type: PtoType.VACATION }, manager)).rejects.toThrow(
        /Nothing was changed/,
      );
      const half = build({ request: approved });
      await expect(half.service.edit('pto-1', { isHalfDay: true }, manager)).rejects.toThrow(
        /half day/,
      );
      const clash = build({
        request: approved,
        overlap: {
          id: 'pto-2',
          status: PtoStatus.APPROVED,
          startDate: new Date('2026-11-06T00:00:00.000Z'),
          endDate: new Date('2026-11-06T00:00:00.000Z'),
        },
      });
      await expect(clash.service.edit('pto-1', { endDate: '2026-11-06' }, manager)).rejects.toThrow(
        /overlaps/,
      );
    });

    it('not their own, and not one already denied or cancelled', async () => {
      const own = build({ request: approved });
      await expect(
        own.service.edit('pto-1', { type: PtoType.SICK }, { ...manager, id: 'emp-1' }),
      ).rejects.toThrow(ForbiddenException);
      const denied = build({ request: { ...approved, status: PtoStatus.DENIED } });
      await expect(denied.service.edit('pto-1', { type: PtoType.SICK }, manager)).rejects.toThrow(
        BadRequestException,
      );
      const none = build();
      await expect(none.service.edit('pto-1', { type: PtoType.SICK }, manager)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approving past the balance', () => {
    const pending = {
      id: 'pto-1',
      employeeId: 'emp-1',
      status: PtoStatus.PENDING,
      type: PtoType.SICK,
      startDate: new Date('2026-11-02T00:00:00.000Z'),
      endDate: new Date('2026-11-06T00:00:00.000Z'),
      isHalfDay: false,
    };
    const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

    it('keeps the days still covered as asked and makes the rest a separate Unpaid part', async () => {
      const { service, prisma, notifications } = build({
        request: pending,
        split: {
          paidDays: 3,
          unpaidDays: 2,
          paid: { startDate: day('2026-11-02'), endDate: day('2026-11-04') },
          unpaid: { startDate: day('2026-11-05'), endDate: day('2026-11-06'), isHalfDay: false },
        },
      });
      await service.review('pto-1', { decision: PtoStatus.APPROVED }, manager);

      const update = prisma.ptoRequest.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'pto-1', status: PtoStatus.PENDING });
      expect(update.data.status).toBe(PtoStatus.APPROVED);
      expect(isoDate(update.data.endDate)).toBe('2026-11-04');
      expect(update.data.type).toBeUndefined();

      const part = prisma.ptoRequest.create.mock.calls[0][0].data;
      expect(part).toMatchObject({
        employeeId: 'emp-1',
        type: PtoType.UNPAID,
        status: PtoStatus.APPROVED,
        splitFromId: 'pto-1',
        unpaidPastBalanceOf: PtoType.SICK,
        reviewedById: 'mgr-1',
      });
      expect(isoDate(part.startDate)).toBe('2026-11-05');
      expect(isoDate(part.endDate)).toBe('2026-11-06');

      expect(prisma.ptoChange.create.mock.calls[0][0].data.summary).toBe(
        'Approved past the sick balance: 3 days Sick, Mon, Nov 2 to Wed, Nov 4; 2 days Unpaid, Thu, Nov 5 to Fri, Nov 6',
      );
      expect(notifications.ptoDecided).toHaveBeenCalledWith('pto-1', 0);
    });

    it('with nothing left, makes the whole request Unpaid', async () => {
      const { service, prisma } = build({
        request: pending,
        split: {
          paidDays: 0,
          unpaidDays: 5,
          paid: null,
          unpaid: { startDate: day('2026-11-02'), endDate: day('2026-11-06'), isHalfDay: false },
        },
      });
      await service.review('pto-1', { decision: PtoStatus.APPROVED }, manager);
      const data = prisma.ptoRequest.update.mock.calls[0][0].data;
      expect(data.type).toBe(PtoType.UNPAID);
      expect(data.unpaidPastBalanceOf).toBe(PtoType.SICK);
      expect(prisma.ptoRequest.create).not.toHaveBeenCalled();
    });

    it('takes their shifts off for every day of it, paid or not', async () => {
      const { service, prisma } = build({
        request: pending,
        shifts: [{ id: 'shift-friday', status: 'PUBLISHED' }],
        split: {
          paidDays: 3,
          unpaidDays: 2,
          paid: { startDate: day('2026-11-02'), endDate: day('2026-11-04') },
          unpaid: { startDate: day('2026-11-05'), endDate: day('2026-11-06'), isHalfDay: false },
        },
      });
      await service.review('pto-1', { decision: PtoStatus.APPROVED, shifts: 'REMOVE' }, manager);
      const where = prisma.shift.findMany.mock.calls[0][0].where;
      // The window reaches Friday, the end of the unpaid part.
      expect(where.startsAt.lt.getTime()).toBeGreaterThan(day('2026-11-06').getTime());
    });

    it('splits nothing when it is declined', async () => {
      const { service, days, prisma } = build({ request: pending });
      await service.review(
        'pto-1',
        { decision: PtoStatus.DENIED, reviewNote: 'Nobody to cover' },
        manager,
      );
      expect(days.approvalSplits).not.toHaveBeenCalledWith([
        expect.objectContaining({ id: 'pto-1' }),
      ]);
      expect(prisma.ptoChange.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    const future = {
      id: 'pto-1',
      employeeId: 'emp-1',
      status: PtoStatus.APPROVED,
      endDate: new Date('2099-01-01T00:00:00.000Z'),
    };

    it('lets an employee withdraw their own', async () => {
      const { service, prisma } = build({ request: future });
      await service.cancel('pto-1', employee);
      expect(prisma.ptoRequest.update.mock.calls[0][0].data.status).toBe(PtoStatus.CANCELLED);
    });

    it('records when it was cancelled rather than deleting the row', async () => {
      const { service, prisma } = build({ request: future });
      await service.cancel('pto-1', employee);
      expect(prisma.ptoRequest.update.mock.calls[0][0].data.cancelledAt).toBeInstanceOf(Date);
    });

    it('hides someone else request from an employee', async () => {
      const { service } = build({ request: { ...future, employeeId: 'emp-2' } });
      await expect(service.cancel('pto-1', employee)).rejects.toThrow(NotFoundException);
    });

    it('lets a manager cancel on behalf of someone', async () => {
      const { service } = build({ request: { ...future, employeeId: 'emp-2' } });
      await expect(service.cancel('pto-1', manager)).resolves.toMatchObject({
        status: PtoStatus.CANCELLED,
      });
    });

    it('refuses to cancel time off that has already passed', async () => {
      const { service } = build({
        request: { ...future, endDate: new Date('2020-01-01T00:00:00.000Z') },
      });
      await expect(service.cancel('pto-1', employee)).rejects.toThrow(/already passed/);
    });

    it('refuses to cancel twice', async () => {
      const { service } = build({ request: { ...future, status: PtoStatus.CANCELLED } });
      await expect(service.cancel('pto-1', employee)).rejects.toThrow(/already cancelled/);
    });

    it('takes the unpaid part of a split request with it', async () => {
      const { service, prisma } = build({ request: { ...future, splitFromId: null } });
      prisma.ptoRequest.findMany.mockResolvedValue([
        { id: 'pto-unpaid', status: PtoStatus.APPROVED, endDate: future.endDate },
      ]);
      await service.cancel('pto-1', employee);
      expect(prisma.ptoRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pto-unpaid'] } },
        data: { status: PtoStatus.CANCELLED, cancelledAt: expect.any(Date) },
      });
    });

    it('refuses to cancel a denied request', async () => {
      const { service } = build({ request: { ...future, status: PtoStatus.DENIED } });
      await expect(service.cancel('pto-1', employee)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listing', () => {
    it('scopes an employee to their own requests whatever they ask for', async () => {
      const { service, prisma } = build();
      await service.findAll({ employeeId: 'emp-2' }, employee);
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.employeeId).toBe('emp-1');
    });

    it('lets a manager filter by employee', async () => {
      const { service, prisma } = build();
      await service.findAll({ employeeId: 'emp-2' }, manager);
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.employeeId).toBe('emp-2');
    });

    it('treats a window as an overlap, not containment', async () => {
      const { service, prisma } = build();
      await service.findAll({ from: '2026-11-01', to: '2026-11-30' }, manager);
      const where = prisma.ptoRequest.findMany.mock.calls[0][0].where;
      // Starts before the window ends, and ends after it starts.
      expect(where.startDate).toEqual({ lte: new Date('2026-11-30') });
      expect(where.endDate).toEqual({ gte: new Date('2026-11-01') });
    });

    it('hides another employee request behind a not-found', async () => {
      const { service } = build({
        request: { id: 'pto-1', employeeId: 'emp-2', startDate: new Date(), endDate: new Date() },
      });
      await expect(service.findOne('pto-1', employee)).rejects.toThrow(NotFoundException);
    });
  });

  /// The Timesheet's days off (November 2026, from Selena's timesheet, where
  /// a PTO day simply looked missing).
  describe('days off in a period', () => {
    const request = {
      id: 'pto-9',
      employeeId: 'emp-1',
      type: PtoType.VACATION,
      status: PtoStatus.APPROVED,
      // Friday 23 to Tuesday 27 October: the weekend is not a day off.
      startDate: new Date('2026-10-23T00:00:00.000Z'),
      endDate: new Date('2026-10-27T00:00:00.000Z'),
      isHalfDay: false,
    };

    it('gives each weekday it takes, inside the period, with its request', async () => {
      const { service, prisma } = build();
      prisma.ptoRequest.findMany.mockResolvedValueOnce([request]);
      const found = await service.daysOff({ from: '2026-10-19', to: '2026-10-26' }, manager);
      expect(found.days).toEqual([
        { date: '2026-10-23', requestId: 'pto-9' },
        { date: '2026-10-26', requestId: 'pto-9' },
      ]);
      expect(found.requests.map((r) => r.id)).toEqual(['pto-9']);
    });

    it('takes approved and waiting time off that overlaps the period, never declined', async () => {
      const { service, prisma } = build();
      await service.daysOff({ from: '2026-10-19', to: '2026-11-01' }, manager);
      const where = prisma.ptoRequest.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: [PtoStatus.APPROVED, PtoStatus.PENDING] });
      expect(where.startDate).toEqual({ lte: new Date('2026-11-01T00:00:00.000Z') });
      expect(where.endDate).toEqual({ gte: new Date('2026-10-19T00:00:00.000Z') });
    });

    it('keeps an employee to their own, whoever they ask about', async () => {
      const { service, prisma } = build();
      await service.daysOff(
        { from: '2026-10-19', to: '2026-11-01', employeeId: 'emp-2' },
        employee,
      );
      expect(prisma.ptoRequest.findMany.mock.calls[0][0].where.employeeId).toBe('emp-1');
    });

    it('refuses a period backwards or over a year', async () => {
      const { service } = build();
      await expect(
        service.daysOff({ from: '2026-11-01', to: '2026-10-01' }, manager),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.daysOff({ from: '2024-01-01', to: '2026-01-01' }, manager),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('pending count', () => {
    it('is zero for an employee', async () => {
      const { service } = build();
      await expect(service.pendingCount(employee)).resolves.toEqual({ pending: 0 });
    });

    it('excludes a manager own requests from their queue', async () => {
      const { service, prisma } = build();
      await service.pendingCount(manager);
      expect(prisma.ptoRequest.count.mock.calls[0][0].where.employeeId).toEqual({
        not: 'mgr-1',
      });
    });
  });

  describe('conflicting shifts', () => {
    it('looks for shifts overlapping the whole last day', async () => {
      const { service, prisma } = build({
        request: {
          employeeId: 'emp-1',
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-05T00:00:00.000Z'),
        },
      });
      await service.conflictingShifts('pto-1');

      const where = prisma.shift.findMany.mock.calls[0][0].where;
      // Up to the end of the 5th, not its midnight start - and New Jersey's
      // days (EST, UTC−5), not UTC's, so an evening shift the night before
      // is not counted.
      expect(where.startsAt).toEqual({ lt: new Date('2026-11-06T05:00:00.000Z') });
      expect(where.endsAt).toEqual({ gt: new Date('2026-11-03T05:00:00.000Z') });
    });
  });
  describe('recording time off already taken', () => {
    const admin = { id: 'adm-1', email: 'dominguez@domihealthcare.com', role: Role.ADMIN };
    const backlog = (overrides: Record<string, unknown> = {}) => ({
      employeeId: 'emp-1',
      type: PtoType.SICK,
      startDate: '2026-03-02',
      endDate: '2026-03-03',
      ...overrides,
    });

    beforeAll(() =>
      jest.useFakeTimers({
        now: new Date('2026-10-01T15:00:00Z'),
        doNotFake: ['nextTick', 'setImmediate'],
      }),
    );
    afterAll(() => jest.useRealTimers());

    it('is approved from the start, by and for the record, with the comment kept', async () => {
      const { service, prisma, notifications } = build();
      const recorded = await service.record(
        backlog({ comment: '  Doctor’s note on file  ' }),
        admin,
      );

      const data = prisma.ptoRequest.create.mock.calls[0][0].data;
      expect(data.status).toBe(PtoStatus.APPROVED);
      expect(data.recordedById).toBe('adm-1');
      expect(data.reviewedById).toBe('adm-1');
      expect(data.reviewNote).toBe('Doctor’s note on file');
      expect(recorded.days).toBe(2);
      // Nothing is being decided, so nobody is told.
      expect(notifications.ptoRequested).not.toHaveBeenCalled();
      expect(notifications.ptoDecided).not.toHaveBeenCalled();
    });

    it('leaves the comment out when there is none', async () => {
      const { service, prisma } = build();
      await service.record(backlog(), admin);
      expect(prisma.ptoRequest.create.mock.calls[0][0].data.reviewNote).toBeNull();
    });

    it('takes today but not days still to come', async () => {
      const { service } = build();
      await expect(
        service.record(backlog({ startDate: '2026-10-01', endDate: '2026-10-01' }), admin),
      ).resolves.toBeDefined();
      await expect(
        service.record(backlog({ startDate: '2026-10-01', endDate: '2026-10-02' }), admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses your own', async () => {
      const { service } = build();
      await expect(service.record(backlog({ employeeId: 'adm-1' }), admin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses days already booked, so nothing is counted twice', async () => {
      const { service } = build({
        overlap: {
          id: 'pto-9',
          status: PtoStatus.APPROVED,
          startDate: new Date('2026-03-03T00:00:00.000Z'),
          endDate: new Date('2026-03-03T00:00:00.000Z'),
        },
      });
      await expect(service.record(backlog(), admin)).rejects.toThrow(/overlaps an approved/);
    });

    it('can be taken back, but a request somebody made cannot', async () => {
      const recorded = build({ request: { id: 'pto-1', recordedById: 'adm-1' } });
      await expect(recorded.service.removeRecorded('pto-1')).resolves.toEqual({ deleted: true });
      expect(recorded.prisma.ptoRequest.delete).toHaveBeenCalledWith({ where: { id: 'pto-1' } });

      const asked = build({ request: { id: 'pto-2', recordedById: null } });
      await expect(asked.service.removeRecorded('pto-2')).rejects.toThrow(BadRequestException);
      expect(asked.prisma.ptoRequest.delete).not.toHaveBeenCalled();
    });
  });
});
