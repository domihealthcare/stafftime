import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { EmployeesService } from './employees.service';

const ID = '33333333-3333-4333-8333-333333333333';

function build() {
  const writes: Record<string, unknown>[] = [];
  const prisma = {
    employee: {
      findUnique: jest.fn(async () => ({ id: ID, pinHash: null, passwordHash: 'x', locations: [] })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { id: ID, ...data, pinHash: null, passwordHash: 'x', locations: [] };
      }),
    },
  };
  return { service: new EmployeesService(prisma as never), prisma, writes };
}

describe('editing somebody on the Staff screen', () => {
  it('stores their email in lower case and tidies their names', async () => {
    const { service, writes } = build();
    await service.update(ID, {
      firstName: ' Jane ',
      lastName: 'Doe ',
      email: ' Jane.Doe@DomiHealthcare.com',
    });
    expect(writes[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@domihealthcare.com',
    });
  });

  it('clears a phone number or a name they go by when it is left blank', async () => {
    const { service, writes } = build();
    await service.update(ID, { phone: '', preferredName: '  ' });
    expect(writes[0].phone).toBeNull();
    expect(writes[0].preferredName).toBeNull();
  });

  it('leaves the phone alone when it is not part of the change', async () => {
    const { service, writes } = build();
    await service.update(ID, { adpFileNumber: '001234' });
    expect(writes[0].phone).toBeUndefined();
    expect(writes[0].preferredName).toBeUndefined();
    expect(writes[0].terminationDate).toBeUndefined();
  });

  it('bringing somebody back takes away their last day', async () => {
    const { service, writes } = build();
    await service.update(ID, { employmentStatus: EmploymentStatus.ACTIVE });
    expect(writes[0]).toMatchObject({ employmentStatus: 'ACTIVE', terminationDate: null });
  });

  it('says plainly when the new email is somebody else’s', async () => {
    const { service, prisma } = build();
    prisma.employee.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      }),
    );
    await expect(service.update(ID, { email: 'taken@x.com' })).rejects.toThrow(
      new ConflictException('Somebody else already signs in with that email.'),
    );
  });
});

describe('marking somebody as no longer employed', () => {
  it('records the last day they worked', async () => {
    const { service, writes } = build();
    await service.terminate(ID, '2026-09-30');
    expect(writes[0].employmentStatus).toBe('TERMINATED');
    expect((writes[0].terminationDate as Date).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('refuses a last day that is not a date', async () => {
    const { service, prisma } = build();
    for (const bad of ['yesterday', '2026-02-30', '30/09/2026']) {
      await expect(service.terminate(ID, bad)).rejects.toThrow(BadRequestException);
    }
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });
});
