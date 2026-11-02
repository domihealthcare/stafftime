import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, isViewingAs } from './auth-user';
import { PayoutsService } from '../../expenses/payouts.service';
import { AnnouncementsService } from '../../announcements/announcements.service';
import { EveryonesScheduleService } from '../../shifts/everyones-schedule.service';
import { RotaCostService } from '../../staff-records/rota-cost.service';

/**
 * View as shows exactly what the chosen person sees (2 November 2026,
 * Dominguez): the per-person lists the admin is on count as off while viewing.
 * A person on every list, read from the "database" below.
 */
const onEveryList = {
  canSeeRotaCost: true,
  canSeeInvoices: true,
  canApproveExpenses: true,
  canManageProductivity: true,
  canPostNews: true,
  canSeeEveryonesSchedule: true,
  employmentStatus: 'ACTIVE',
};
const prisma = { employee: { findUnique: jest.fn().mockResolvedValue(onEveryList) } };
const viewing: AuthUser = {
  id: 'admin',
  email: 'a@b.c',
  role: Role.EMPLOYEE,
  actualRole: Role.ADMIN,
};
const asThemselvesEmployee: AuthUser = { id: 'admin', email: 'a@b.c', role: Role.EMPLOYEE };

describe('View as and the per-person lists', () => {
  it('knows when somebody is viewing as', () => {
    expect(isViewingAs(viewing)).toBe(true);
    expect(isViewingAs(asThemselvesEmployee)).toBe(false);
    expect(isViewingAs(null)).toBe(false);
  });

  it('the payroll prompt: an approver viewing as an employee does not see it', async () => {
    const service = new PayoutsService(prisma as never, {} as never);
    await expect(service.allowed(viewing)).resolves.toBe(false);
    await expect(service.allowed(asThemselvesEmployee)).resolves.toBe(true);
  });

  it('News posting is refused while viewing', async () => {
    const service = new AnnouncementsService(prisma as never, {} as never, {} as never);
    await expect(service.assertCanPost(viewing)).rejects.toThrow(ForbiddenException);
    await expect(service.assertCanPost(asThemselvesEmployee)).resolves.toBeUndefined();
  });

  it("everyone's schedule is refused while viewing as an employee", async () => {
    const service = new EveryonesScheduleService(prisma as never);
    await expect(service.assertCanSee(viewing)).rejects.toThrow(ForbiddenException);
    await expect(service.assertCanSee(asThemselvesEmployee)).resolves.toBeUndefined();
  });

  it("the rota's cost is refused while viewing", async () => {
    const service = new RotaCostService(prisma as never, {} as never);
    await expect(service.assertAllowed(viewing)).rejects.toThrow(ForbiddenException);
    await expect(service.assertAllowed(asThemselvesEmployee)).resolves.toBeUndefined();
  });
});
