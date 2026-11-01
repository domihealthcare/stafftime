import { CmeStatus, ExpenseStatus, Prisma } from '@prisma/client';
import { toUtcDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Approved reimbursements not paid back yet, for the payroll prompt (1
 * November 2026, Dominguez): expenses and CME alike. `today` (YYYY-MM-DD, New
 * Jersey's) leaves out the ones put off with "Not this time" until their day.
 * One definition for the Export screen, "Before you export" and "Payroll is
 * due", so they cannot disagree.
 */
const notPutOff = (today: string) => [
  { payDeferredUntil: null },
  { payDeferredUntil: { lte: toUtcDate(today) } },
];

export function unpaidExpenses(today?: string): Prisma.ExpenseRequestWhereInput {
  return {
    status: ExpenseStatus.APPROVED,
    paidOn: null,
    ...(today ? { OR: notPutOff(today) } : {}),
  };
}

export function unpaidCme(today?: string): Prisma.CmeRequestWhereInput {
  return {
    status: CmeStatus.APPROVED,
    reimbursedOn: null,
    ...(today ? { OR: notPutOff(today) } : {}),
  };
}

/// How many are due to be dealt with today (put-off ones left out).
export async function countUnpaid(
  prisma: Pick<PrismaService, 'expenseRequest' | 'cmeRequest'>,
  today: string,
): Promise<number> {
  const [expenses, cme] = await Promise.all([
    prisma.expenseRequest.count({ where: unpaidExpenses(today) }),
    prisma.cmeRequest.count({ where: unpaidCme(today) }),
  ]);
  return expenses + cme;
}
