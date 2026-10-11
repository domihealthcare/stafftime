import { Injectable, Logger } from '@nestjs/common';
import { EmploymentStatus, Prisma, ShiftStatus } from '@prisma/client';
import {
  addDaysTo,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { WEEKLY_SUMMARY_FROM, weeklySummaryWords } from '../time-entries/weekly-summary';

/**
 * "Your week" on Sunday evening (October 2026, Dominguez — see
 * `time-entries/weekly-summary.ts`). Run by the five-minute timer: from 6pm on
 * a Sunday in New Jersey, everybody active who has not turned it off
 * (`Employee.wantsWeeklySummary`) and had hours last week or has shifts this
 * week is told once — claimed in `WeeklySummary` before sending.
 */
@Injectable()
export class WeeklySummaryService {
  private readonly logger = new Logger(WeeklySummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(now: Date = new Date()): Promise<number> {
    const today = localDateIn(now, PRACTICE_ZONE);
    // Sunday is 7 in ISO weekdays.
    if (isoWeekdayOf(today) !== 7 || localTimeIn(now, PRACTICE_ZONE) < WEEKLY_SUMMARY_FROM)
      return 0;

    const lastFrom = addDaysTo(today, -7);
    const lastTo = addDaysTo(today, -1);
    const lastStart = zonedTimeToUtc(lastFrom, '00:00', PRACTICE_ZONE);
    const weekStart = zonedTimeToUtc(today, '00:00', PRACTICE_ZONE);
    const weekEnd = zonedTimeToUtc(addDaysTo(today, 7), '00:00', PRACTICE_ZONE);
    const claimDay = new Date(`${today}T00:00:00.000Z`);

    const people = await this.prisma.employee.findMany({
      where: {
        employmentStatus: EmploymentStatus.ACTIVE,
        wantsWeeklySummary: true,
        weeklySummaries: { none: { weekStart: claimDay } },
      },
      select: { id: true },
    });

    let sent = 0;
    for (const person of people) {
      const [entries, shifts] = await Promise.all([
        this.prisma.timeEntry.findMany({
          where: {
            employeeId: person.id,
            clockInAt: { gte: lastStart, lt: weekStart },
            clockOutAt: { not: null },
          },
          select: {
            clockInAt: true,
            clockOutAt: true,
            autoClockedOutAt: true,
            isMissingPunch: true,
          },
        }),
        this.prisma.shift.findMany({
          where: {
            employeeId: person.id,
            status: ShiftStatus.PUBLISHED,
            startsAt: { gte: now, lt: weekEnd },
          },
          select: {
            startsAt: true,
            endsAt: true,
            isRemote: true,
            location: { select: { name: true } },
          },
          orderBy: { startsAt: 'asc' },
        }),
      ]);
      const counted = entries.filter((entry) => !(entry.autoClockedOutAt && entry.isMissingPunch));
      const hours =
        Math.round(
          (counted.reduce(
            (sum, entry) => sum + (entry.clockOutAt!.getTime() - entry.clockInAt.getTime()),
            0,
          ) /
            3_600_000) *
            10,
        ) / 10;
      const words = weeklySummaryWords({
        lastFrom,
        lastTo,
        hours,
        toCorrect: entries.length - counted.length,
        shifts: shifts.map((shift) => ({
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          isRemote: shift.isRemote,
          locationName: shift.location.name,
        })),
      });
      if (!words) continue;
      if (!(await this.claim(person.id, claimDay))) continue;
      await this.notifications.weeklySummary(person.id, { ...words, link: '/schedule' });
      sent += 1;
    }
    if (sent > 0) this.logger.log(`Sent ${sent} weekly summaries`);
    return sent;
  }

  private async claim(employeeId: string, weekStart: Date): Promise<boolean> {
    try {
      await this.prisma.weeklySummary.create({ data: { employeeId, weekStart } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}
