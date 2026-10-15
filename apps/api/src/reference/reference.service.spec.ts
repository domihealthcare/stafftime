import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReferenceAudience, Role } from '@prisma/client';
import { checkRows, MAX_CELL, ReferenceService } from './reference.service';

const staff = { id: 'emp-1', email: 'frankie@domihealthcare.com', role: Role.EMPLOYEE };
const manager = { id: 'mgr-1', email: 'manager@domihealthcare.com', role: Role.MANAGER };

function table(over: Record<string, unknown> = {}) {
  return {
    id: 'tab-1',
    title: 'Fee schedule',
    notes: null,
    audience: ReferenceAudience.MANAGERS,
    headerRows: 1,
    keyColumns: 2,
    sortOrder: 1,
    updatedAt: new Date('2026-10-15T12:00:00.000Z'),
    rows: [
      ['CPT', 'Description', 'Medicare'],
      ['99202', 'New Pt, Prob 2', '78.32'],
    ],
    ...over,
  };
}

function build(found: unknown = table()) {
  const prisma = {
    referenceTable: {
      findMany: jest.fn().mockResolvedValue([found]),
      findUnique: jest.fn().mockResolvedValue(found),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 3 } }),
      create: jest.fn().mockResolvedValue({ id: 'tab-1' }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  return { service: new ReferenceService(prisma as never), prisma };
}

describe('ReferenceService', () => {
  it('lists only the tables for everyone to staff', async () => {
    const { service, prisma } = build();
    await service.list(staff);
    expect(prisma.referenceTable.findMany.mock.calls[0][0].where).toEqual({
      audience: ReferenceAudience.EVERYONE,
    });
  });

  it('lists every table to a manager, with how many rows and columns', async () => {
    const { service, prisma } = build();
    const [listed] = await service.list(manager);
    expect(prisma.referenceTable.findMany.mock.calls[0][0].where).toEqual({});
    expect(listed).toMatchObject({ title: 'Fee schedule', rowCount: 1, columnCount: 3 });
    expect(listed).not.toHaveProperty('rows');
  });

  it('does not let staff open the fee schedule, or learn it is there', async () => {
    const { service } = build();
    await expect(service.get('tab-1', staff)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get('tab-1', manager)).resolves.toMatchObject({ title: 'Fee schedule' });
  });

  it('reads a pasted table into rows when it is made, last in the list', async () => {
    const { service, prisma } = build();
    await service.create(
      {
        title: ' Diagnostics — Ultrasounds ',
        audience: ReferenceAudience.EVERYONE,
        headerRows: 2,
        keyColumns: 2,
        pasted: 'Plan\tAbdomen\nAetna\tYES\n',
      },
      manager,
    );
    expect(prisma.referenceTable.create.mock.calls[0][0].data).toMatchObject({
      title: 'Diagnostics — Ultrasounds',
      rows: [
        ['Plan', 'Abdomen'],
        ['Aetna', 'YES'],
      ],
      sortOrder: 4,
      updatedById: 'mgr-1',
    });
  });
});

describe('checkRows', () => {
  it('takes rows edited on screen, trimmed', () => {
    expect(checkRows({ rows: [[' A ', 'B'], []] })).toEqual([['A', 'B'], []]);
  });

  it('refuses nothing, and anything that is not rows of text', () => {
    expect(() => checkRows({ pasted: '\n\n' })).toThrow(BadRequestException);
    expect(() => checkRows({})).toThrow(/Paste the table/);
    expect(() => checkRows({ rows: [['A', 2]] })).toThrow(/not a row of text/);
    expect(() => checkRows({ rows: ['A'] })).toThrow(/not a row of text/);
  });

  it('refuses a cell too long to be a cell', () => {
    expect(() => checkRows({ rows: [['x'.repeat(MAX_CELL + 1)]] })).toThrow(/longer than/);
  });
});
