import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmploymentChangeKind, PayRateUnit, Prisma } from '@prisma/client';
import { EmploymentChangeView, StaffRecordsService, currentOf } from './staff-records.service';

function change(overrides: Partial<EmploymentChangeView>): EmploymentChangeView {
  return {
    id: 'c',
    effectiveOn: '2026-01-01',
    kind: EmploymentChangeKind.OTHER,
    position: null,
    payRate: null,
    payUnit: null,
    note: null,
    recordedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('what somebody is paid and does now', () => {
  it('takes the latest position and the latest pay, each from its own change', () => {
    // Newest first, as the service lists them.
    const changes = [
      change({ effectiveOn: '2026-09-01', kind: 'PAY_CHANGE', payRate: 24, payUnit: 'HOURLY' }),
      change({
        effectiveOn: '2026-05-01',
        kind: 'PROMOTION',
        position: 'Lead Medical Assistant',
        payRate: 22,
        payUnit: 'HOURLY',
      }),
      change({ effectiveOn: '2025-03-10', kind: 'HIRED', position: 'Medical Assistant' }),
    ];
    expect(currentOf(changes, '2026-10-01')).toEqual({
      position: { value: 'Lead Medical Assistant', since: '2026-05-01' },
      pay: { rate: 24, unit: 'HOURLY', since: '2026-09-01' },
    });
  });

  it('does not count a raise agreed for next month until its day', () => {
    const changes = [
      change({ effectiveOn: '2026-11-01', payRate: 26, payUnit: 'HOURLY' }),
      change({ effectiveOn: '2026-01-01', payRate: 24, payUnit: 'HOURLY' }),
    ];
    expect(currentOf(changes, '2026-10-01').pay?.rate).toBe(24);
    expect(currentOf(changes, '2026-11-01').pay?.rate).toBe(26);
  });

  it('is nothing at all with no history', () => {
    expect(currentOf([], '2026-10-01')).toEqual({ position: null, pay: null });
  });
});

describe('StaffRecordsService', () => {
  function build(employee: unknown = { id: 'emp-1' }) {
    const prisma = {
      employee: { findUnique: jest.fn().mockResolvedValue(employee) },
      employeePersonalRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      employmentChange: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'chg-1', employeeId: 'emp-1' }),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new StaffRecordsService(prisma as any), prisma };
  }

  const raise = {
    effectiveOn: '2026-09-01',
    kind: EmploymentChangeKind.PAY_CHANGE,
    payRate: 24.5,
    payUnit: PayRateUnit.HOURLY,
  };

  it('answers with an empty record for somebody with nothing on file yet', async () => {
    const { service } = build();
    const record = await service.get('emp-1', 'adm-1');
    expect(record.personal.addressLine1).toBeNull();
    expect(record.personal.emergencyContactPhone).toBeNull();
    expect(record.changes).toEqual([]);
  });

  it('says so for somebody who does not exist', async () => {
    const { service } = build(null);
    await expect(service.get('nobody', 'adm-1')).rejects.toThrow(NotFoundException);
  });

  it('turns stored pay back into a plain number', async () => {
    const { service, prisma } = build();
    prisma.employmentChange.findMany.mockResolvedValue([
      {
        id: 'chg-1',
        employeeId: 'emp-1',
        effectiveOn: new Date('2026-09-01T00:00:00.000Z'),
        kind: 'PAY_CHANGE',
        position: null,
        payRate: new Prisma.Decimal('24.50'),
        payUnit: 'HOURLY',
        note: null,
        recordedById: 'adm-1',
        recordedBy: { firstName: 'Ana', lastName: 'Dominguez' },
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-01T12:00:00.000Z'),
      },
    ]);
    const record = await service.get('emp-1', 'adm-1');
    expect(record.changes[0]).toMatchObject({
      effectiveOn: '2026-09-01',
      payRate: 24.5,
      recordedBy: 'Ana Dominguez',
    });
  });

  it('trims the address, clears blanks and leaves out what was not sent', async () => {
    const { service, prisma } = build();
    await service.updatePersonal(
      'emp-1',
      { addressLine1: ' 12 Main St ', addressLine2: '   ', city: 'North Bergen' },
      'adm-1',
    );
    const { update } = prisma.employeePersonalRecord.upsert.mock.calls[0][0];
    expect(update).toEqual({
      addressLine1: '12 Main St',
      addressLine2: null,
      city: 'North Bergen',
      updatedById: 'adm-1',
    });
  });

  it('records a raise with who wrote it down', async () => {
    const { service, prisma } = build();
    await service.addChange('emp-1', raise, 'adm-1');
    const { data } = prisma.employmentChange.create.mock.calls[0][0];
    expect(data.recordedById).toBe('adm-1');
    expect(data.effectiveOn).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(data.payRate.toString()).toBe('24.5');
  });

  it('wants a pay amount and its unit together', async () => {
    const { service } = build();
    await expect(
      service.addChange('emp-1', { ...raise, payUnit: undefined }, 'adm-1'),
    ).rejects.toThrow(/per hour or per year/);
    await expect(service.addChange('emp-1', { ...raise, payRate: null }, 'adm-1')).rejects.toThrow(
      /pay amount/,
    );
  });

  it('refuses a change that says nothing', async () => {
    const { service } = build();
    await expect(
      service.addChange(
        'emp-1',
        { effectiveOn: '2026-09-01', kind: EmploymentChangeKind.PROMOTION, position: '  ' },
        'adm-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('edits and removes a change, and says so when it is already gone', async () => {
    const { service, prisma } = build();
    await service.updateChange('chg-1', raise, 'adm-1');
    expect(prisma.employmentChange.update).toHaveBeenCalled();
    await service.removeChange('chg-1', 'adm-1');
    expect(prisma.employmentChange.delete).toHaveBeenCalledWith({ where: { id: 'chg-1' } });

    prisma.employmentChange.findUnique.mockResolvedValue(null);
    await expect(service.removeChange('chg-1', 'adm-1')).rejects.toThrow(NotFoundException);
  });
});
