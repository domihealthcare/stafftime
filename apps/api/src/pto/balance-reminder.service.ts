import { Injectable } from '@nestjs/common';
import { EmploymentStatus } from '@prisma/client';
import { localDateIn, PRACTICE_ZONE, zonedTimeToUtc } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { PtoBalance, PtoPolicyService } from './pto-policy.service';

/**
 * A pop-up at the start of every month with the time off somebody has left
 * (October 2026, Dominguez, from staff feedback: "so they are aware"). Shown
 * on Home the first time they open it in a month, once - the month they last
 * saw it is kept on them. Not for somebody with neither PTO nor sick time,
 * nor anybody who has left, nor somebody added to the app this month - they
 * have only just started, and will have it from next month.
 */
@Injectable()
export class BalanceReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PtoPolicyService,
  ) {}

  async due(
    employeeId: string,
    now = new Date(),
  ): Promise<{ show: false } | { show: true; month: string; balance: PtoBalance }> {
    const month = localDateIn(now, PRACTICE_ZONE).slice(0, 7);
    const person = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { balanceReminderMonth: true, employmentStatus: true, createdAt: true },
    });
    if (
      !person ||
      person.employmentStatus === EmploymentStatus.TERMINATED ||
      person.balanceReminderMonth === month ||
      person.createdAt >= zonedTimeToUtc(`${month}-01`, '00:00', PRACTICE_ZONE)
    ) {
      return { show: false };
    }
    const balance = await this.policy.balanceFor(employeeId);
    const hasAny =
      balance.vacation.available > 0 || balance.sick.available > 0 || Boolean(balance.sick.accrual);
    if (!hasAny) return { show: false };
    return { show: true, month, balance };
  }

  async seen(employeeId: string, now = new Date()): Promise<{ month: string }> {
    const month = localDateIn(now, PRACTICE_ZONE).slice(0, 7);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { balanceReminderMonth: month },
    });
    return { month };
  }
}
