import { PayRaiseStatus } from '@prisma/client';
import { A_PERSON } from '../common/people';
import { practiceToday } from '../common/util/zoned-time.util';
import type { PrismaService } from '../prisma/prisma.service';
import { NOT_A_PROVIDER } from './rota-cost.service';

/// Whether Your pay is in somebody's account menu (November 2026): there is
/// pay on file they may see, in force today and not from a raise they have
/// not been told about. Providers and shared accounts never have it.
export async function hasOwnPay(prisma: PrismaService, employeeId: string): Promise<boolean> {
  const untold = await prisma.payRaise.findMany({
    where: {
      employeeId,
      status: PayRaiseStatus.APPROVED,
      toldAt: null,
      payChangeId: { not: null },
    },
    select: { payChangeId: true },
  });
  const count = await prisma.employmentChange.count({
    where: {
      employeeId,
      employee: { ...NOT_A_PROVIDER, ...A_PERSON },
      payRate: { not: null },
      effectiveOn: { lte: practiceToday() },
      id: { notIn: untold.map((raise) => raise.payChangeId!) },
    },
  });
  return count > 0;
}
