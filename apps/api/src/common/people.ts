import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A shared account is not a person (23 October 2026, Dominguez: a general
 * office@ account with front desk access). It signs in and sees what its
 * access level and job roles give it, but it never clocks in, is never put
 * on a shift or asks for time off, and is left out of everything that counts
 * or lists people: the Directory and birthdays, 360 feedback, pulse surveys,
 * required reading, "never signed in", who can cover, too many off at once,
 * licenses by person and pay.
 *
 * Spread this into a `where` on `employee` wherever the answer is "the
 * people who work here".
 */
export const A_PERSON = { isSharedAccount: false } satisfies Prisma.EmployeeWhereInput;

/// Refuses a shared account where only a person will do.
export async function assertAPerson(
  prisma: Pick<PrismaService, 'employee'>,
  employeeId: string,
  message: string,
): Promise<void> {
  const shared = await prisma.employee.count({ where: { id: employeeId, isSharedAccount: true } });
  if (shared > 0) throw new BadRequestException(message);
}
