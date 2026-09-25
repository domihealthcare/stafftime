import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmployeesService } from './employees.service';
import type { ImportedEmployeeDto } from './dto/import-employees.dto';

const NB = '11111111-1111-4111-8111-111111111111';
const FD = '22222222-2222-4222-8222-222222222222';

const person = (email: string, extra: Partial<ImportedEmployeeDto> = {}): ImportedEmployeeDto => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email,
  hireDate: '2024-03-01',
  locationIds: [NB],
  primaryLocationId: NB,
  jobRoleIds: [FD],
  ...extra,
});

function build(existing: string[] = []) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    employee: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `id-${created.length}` };
      }),
    },
  };
  const prisma = {
    employee: {
      findMany: jest.fn(async () => existing.map((email) => ({ email }))),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, pinHash: null })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { service: new EmployeesService(prisma as never), prisma, tx, created };
}

describe('importing a staff list', () => {
  it('adds everybody, with their offices and job roles, and stores addresses in lower case', async () => {
    const { service, created } = build();
    const result = await service.importMany([
      person('Jane.Doe@DomiHealthcare.com'),
      person('sam@domihealthcare.com', { firstName: 'Sam', jobRoleIds: [] }),
    ]);

    expect(result.created).toBe(2);
    expect(created[0].email).toBe('jane.doe@domihealthcare.com');
    expect(created[0].locations).toEqual({ create: [{ locationId: NB, isPrimary: true }] });
    expect(created[0].jobRoles).toEqual({ create: [{ jobRoleId: FD }] });
    expect(created[1].jobRoles).toBeUndefined();
  });

  it('refuses a list with the same person twice, naming both rows', async () => {
    const { service, tx } = build();
    await expect(
      service.importMany([person('a@x.com'), person('b@x.com'), person('A@x.com ')]),
    ).rejects.toThrow(new BadRequestException('Rows 1 and 3 have the same email, a@x.com.'));
    expect(tx.employee.create).not.toHaveBeenCalled();
  });

  it('refuses the whole list when somebody is already in the app, and says who', async () => {
    const { service, tx } = build(['b@x.com']);
    await expect(service.importMany([person('a@x.com'), person('B@x.com')])).rejects.toThrow(
      ConflictException,
    );
    await expect(service.importMany([person('a@x.com'), person('B@x.com')])).rejects.toThrow(
      /Already in the app: b@x.com/,
    );
    expect(tx.employee.create).not.toHaveBeenCalled();
  });

  it('names the row when the database refuses one part-way through', async () => {
    const { service, tx } = build();
    tx.employee.create
      .mockImplementationOnce(async () => ({ id: 'ok' }))
      .mockImplementationOnce(async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['adpFileNumber'] },
        });
      });
    await expect(
      service.importMany([person('a@x.com'), person('b@x.com', { adpFileNumber: '123' })]),
    ).rejects.toThrow('Row 2 (b@x.com): Somebody else already has that ADP File #.');
  });

  it('refuses a primary office the person is not assigned to', async () => {
    const { service } = build();
    await expect(
      service.importMany([person('a@x.com', { locationIds: [], primaryLocationId: NB })]),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('one person at a time', () => {
  it('stores the address in lower case, so they can sign in', async () => {
    const { service, prisma } = build();
    await service.create(person('Mixed.Case@DomiHealthcare.com'));
    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'mixed.case@domihealthcare.com' }),
      }),
    );
  });
});
