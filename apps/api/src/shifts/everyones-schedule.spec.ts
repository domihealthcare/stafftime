import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmploymentStatus, Role } from '@prisma/client';
import { EveryonesScheduleService } from './everyones-schedule.service';

function build(person: unknown) {
  const prisma = {
    employee: { findUnique: jest.fn().mockResolvedValue(person), findMany: jest.fn() },
  };
  return new EveryonesScheduleService(prisma as never);
}

describe('EveryonesScheduleService.assertCanSee', () => {
  it('lets managers and admins in without looking anybody up', async () => {
    const service = build(null);
    await expect(service.assertCanSee({ id: 'm', role: Role.MANAGER })).resolves.toBeUndefined();
    await expect(service.assertCanSee({ id: 'a', role: Role.ADMIN })).resolves.toBeUndefined();
  });

  it('lets staff in only when an admin has switched it on', async () => {
    const on = build({ canSeeEveryonesSchedule: true, employmentStatus: EmploymentStatus.ACTIVE });
    await expect(on.assertCanSee({ id: 'e', role: Role.EMPLOYEE })).resolves.toBeUndefined();
    const off = build({
      canSeeEveryonesSchedule: false,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    await expect(off.assertCanSee({ id: 'e', role: Role.EMPLOYEE })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses somebody who has left, switched on or not', async () => {
    const gone = build({
      canSeeEveryonesSchedule: true,
      employmentStatus: EmploymentStatus.TERMINATED,
    });
    await expect(gone.assertCanSee({ id: 'e', role: Role.EMPLOYEE })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('EveryonesScheduleService.read', () => {
  it('refuses a backwards or oversized range', async () => {
    const service = build(null);
    await expect(
      service.read('2026-10-20T00:00:00Z', '2026-10-19T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.read('nonsense', '2026-10-19T00:00:00Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.read('2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('asks only for published, assigned shifts and approved time off, and never the kind', async () => {
    const shiftFindMany = jest.fn().mockResolvedValue([]);
    const ptoFindMany = jest.fn().mockResolvedValue([
      {
        employeeId: 'e1',
        startDate: new Date('2026-10-20T00:00:00Z'),
        endDate: new Date('2026-10-21T00:00:00Z'),
      },
    ]);
    const prisma = {
      location: { findMany: jest.fn().mockResolvedValue([]) },
      shift: { findMany: shiftFindMany },
      ptoRequest: { findMany: ptoFindMany },
      employee: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new EveryonesScheduleService(prisma as never);
    const result = await service.read('2026-10-18T00:00:00Z', '2026-10-25T00:00:00Z');
    expect(shiftFindMany.mock.calls[0][0].where).toMatchObject({
      status: 'PUBLISHED',
      employeeId: { not: null },
    });
    expect(shiftFindMany.mock.calls[0][0].select).not.toHaveProperty('notes');
    expect(ptoFindMany.mock.calls[0][0].where.status).toBe('APPROVED');
    expect(ptoFindMany.mock.calls[0][0].select).toEqual({
      employeeId: true,
      startDate: true,
      endDate: true,
    });
    expect(result.off).toEqual([
      { employeeId: 'e1', startDate: '2026-10-20', endDate: '2026-10-21' },
    ]);
  });
});
