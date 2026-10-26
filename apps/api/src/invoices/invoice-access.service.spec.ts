import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmploymentStatus } from '@prisma/client';
import { InvoiceAccessGuard, InvoiceAccessService } from './invoice-access.service';

const contextFor = (user: { id: string } | undefined) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

function serviceWith(
  people: Record<string, { canSeeInvoices: boolean; employmentStatus: EmploymentStatus }>,
) {
  const prisma = {
    employee: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id] ?? null),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
      update: jest.fn(() => Promise.resolve({})),
    },
  };
  return { service: new InvoiceAccessService(prisma as never), prisma };
}

describe('InvoiceAccessGuard', () => {
  const { service } = serviceWith({
    listed: { canSeeInvoices: true, employmentStatus: EmploymentStatus.ACTIVE },
    notListed: { canSeeInvoices: false, employmentStatus: EmploymentStatus.ACTIVE },
    left: { canSeeInvoices: true, employmentStatus: EmploymentStatus.TERMINATED },
  });
  const guard = new InvoiceAccessGuard(service);

  it('lets in somebody on the list, whatever their access level', async () => {
    await expect(guard.canActivate(contextFor({ id: 'listed' }))).resolves.toBe(true);
  });

  it('refuses anybody not on it, somebody who has left, and nobody', async () => {
    for (const user of [{ id: 'notListed' }, { id: 'left' }, { id: 'unknown' }, undefined])
      await expect(guard.canActivate(contextFor(user))).rejects.toThrow(ForbiddenException);
  });
});

describe('InvoiceAccessService', () => {
  it('never lets somebody take themselves off, so the list is never left empty', async () => {
    const { service, prisma } = serviceWith({});
    await expect(service.remove('me', 'me')).rejects.toThrow(BadRequestException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });
});
