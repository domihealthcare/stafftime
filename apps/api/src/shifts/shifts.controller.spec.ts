import { NotFoundException } from '@nestjs/common';
import { Role, ShiftStatus } from '@prisma/client';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

/// Staff read their own shifts, and never a draft: a shift reaches them when
/// a manager publishes it (docs/architecture.md).
describe('ShiftsController — what staff can read', () => {
  const staff = { id: 'emp-1', email: 'a@example.com', role: Role.EMPLOYEE };
  const manager = { id: 'mgr-1', email: 'm@example.com', role: Role.MANAGER };

  function build(shift: Record<string, unknown> | null = null) {
    const prisma = {
      shift: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(shift),
      },
    };
    const shifts = new ShiftsService(prisma as never, {} as never, {} as never);
    const controller = new ShiftsController(shifts, {} as never, {} as never, {} as never, {} as never);
    return { controller, prisma };
  }

  const whereOf = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.shift.findMany.mock.calls[0][0].where;

  it('leaves drafts out of a member of staff’s list, and keeps them to their own', async () => {
    const { controller, prisma } = build();
    await controller.findAll({ employeeId: 'somebody-else' }, staff);
    expect(whereOf(prisma)).toMatchObject({
      employeeId: 'emp-1',
      status: { not: ShiftStatus.DRAFT },
    });
  });

  it('gives a member of staff nothing when they ask for drafts', async () => {
    const { controller, prisma } = build();
    const result = await controller.findAll({ status: ShiftStatus.DRAFT }, staff);
    expect(result).toEqual([]);
    expect(prisma.shift.findMany).not.toHaveBeenCalled();
  });

  it('still lets a member of staff ask for their cancelled shifts', async () => {
    const { controller, prisma } = build();
    await controller.findAll({ status: ShiftStatus.CANCELLED }, staff);
    expect(whereOf(prisma)).toMatchObject({ employeeId: 'emp-1', status: ShiftStatus.CANCELLED });
  });

  it('shows a manager drafts as before', async () => {
    const { controller, prisma } = build();
    await controller.findAll({}, manager);
    expect(whereOf(prisma).status).toBeUndefined();
    await controller.findAll({ status: ShiftStatus.DRAFT }, manager);
    expect(prisma.shift.findMany.mock.calls[1][0].where.status).toBe(ShiftStatus.DRAFT);
  });

  it('answers a member of staff’s own draft as not found', async () => {
    const { controller } = build({ id: 'sh-1', employeeId: 'emp-1', status: ShiftStatus.DRAFT });
    await expect(controller.findOne('sh-1', staff)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives a member of staff their own published shift', async () => {
    const shift = { id: 'sh-1', employeeId: 'emp-1', status: ShiftStatus.PUBLISHED };
    const { controller } = build(shift);
    await expect(controller.findOne('sh-1', staff)).resolves.toBe(shift);
  });

  it('answers somebody else’s shift as not found', async () => {
    const { controller } = build({
      id: 'sh-1',
      employeeId: 'emp-2',
      status: ShiftStatus.PUBLISHED,
    });
    await expect(controller.findOne('sh-1', staff)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives a manager a draft', async () => {
    const shift = { id: 'sh-1', employeeId: 'emp-1', status: ShiftStatus.DRAFT };
    const { controller } = build(shift);
    await expect(controller.findOne('sh-1', manager)).resolves.toBe(shift);
  });
});
