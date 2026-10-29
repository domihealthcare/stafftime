import { GUARDS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExportsController } from '../exports/exports.controller';
import { InvoiceAccessGuard } from '../invoices/invoice-access.service';
import { InvoicesController } from '../invoices/invoices.controller';
import { ProductivityController } from '../productivity/productivity.controller';
import { ReimbursementsController } from '../reimbursements/reimbursements.controller';
import { PayController } from '../staff-records/pay.controller';
import { RotaCostController } from '../staff-records/rota-cost.controller';
import { StaffRecordsController } from '../staff-records/staff-records.controller';
import { VendorsController } from '../vendors/vendors.controller';
import { PayLockGuard } from './pay-lock.guard';

/**
 * "Anything that shows pay asks for the person's PIN first" (October 2026).
 * The PIN is held by `PayLockGuard` on each controller that answers with pay;
 * taking it off one is a one-line change that no screen would show, so this
 * pins where it is.
 */
const guardsOn = (target: object): unknown[] => Reflect.getMetadata(GUARDS_METADATA, target) ?? [];

describe('the routes that show pay', () => {
  it.each([
    ['Pay & raises', PayController],
    ['staff profiles', StaffRecordsController],
    ['provider productivity', ProductivityController],
    ['the payroll export', ExportsController],
    ['reimbursements', ReimbursementsController],
    ['invoices', InvoicesController],
    ['vendor payments', VendorsController],
  ])('%s: every route is behind the PIN', (_name, controller) => {
    expect(guardsOn(controller)).toContain(PayLockGuard);
  });

  it("the rota's cost is behind the PIN, but not its list of who may see it", () => {
    expect(guardsOn(RotaCostController.prototype.cost)).toContain(PayLockGuard);
    for (const route of [
      RotaCostController.prototype.accessList,
      RotaCostController.prototype.grant,
      RotaCostController.prototype.revoke,
    ]) {
      expect(guardsOn(route)).not.toContain(PayLockGuard);
    }
    expect(guardsOn(RotaCostController)).not.toContain(PayLockGuard);
  });

  it('invoices ask whether somebody is on the list before asking for the PIN', () => {
    // So somebody not on it is told so, rather than asked for a PIN.
    expect(guardsOn(InvoicesController)).toEqual([InvoiceAccessGuard, PayLockGuard]);
  });

  it('signs people in before checking their role, for every route', () => {
    // Read from the source: importing AppModule checks the environment.
    const source = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');
    const appGuards = [...source.matchAll(/provide: APP_GUARD, useClass: (\w+)/g)].map(
      (match) => match[1],
    );
    expect(appGuards).toEqual(['SessionAuthGuard', 'RolesGuard']);
  });
});
