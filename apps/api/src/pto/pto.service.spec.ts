import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PtoStatus, PtoType, Role } from '@prisma/client';
import { PtoService, countDays, isoDate } from './pto.service';

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
    } = {},
  ) {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(
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
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-05T00:00:00.000Z'),
          isHalfDay: false,
          ...data,
        })),
        count: jest.fn().mockResolvedValue(3),
      },
      shift: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new PtoService(prisma as any), prisma };
  }

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
      await expect(
        service.create(request({ employeeId: 'emp-2' }), employee),
      ).rejects.toThrow(/only request time off for yourself/);
    });

    it('lets a manager file on behalf of someone who phoned in sick', async () => {
      const { service, prisma } = build();
      await service.create(
        request({ employeeId: 'emp-1', type: PtoType.SICK }),
        manager,
      );
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

    it('rejects a decision that is not approve or deny', async () => {
      const { service } = build({ request: pending });
      await expect(
        service.review('pto-1', { decision: PtoStatus.CANCELLED }, manager),
      ).rejects.toThrow(/must be APPROVED or DENIED/);
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
      // Up to the end of the 5th, not its midnight start.
      expect(where.startsAt).toEqual({ lt: new Date('2026-11-06T00:00:00.000Z') });
      expect(where.endsAt).toEqual({ gt: new Date('2026-11-03T00:00:00.000Z') });
    });
  });
});
