import { Injectable } from '@nestjs/common';
import { ChecklistTaskStatus, EmploymentStatus, PtoStatus, TimeEntryStatus } from '@prisma/client';
import { addUtcDays } from '../common/util/calendar-date.util';
import { practiceDayStart, practiceToday } from '../common/util/zoned-time.util';
import { CredentialsService } from '../credentials/credentials.service';
import { loadStanding } from '../credentials/standing-query';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';

/// Closing checklists are counted over the last week, today included.
const CLOSING_DAYS = 7;

/**
 * The Dashboard's second half (Dominguez, September 2026): everything a
 * manager keeps an eye on besides hours — surveys, licenses, onboarding and
 * offboarding, closing checklists, and what is waiting on a manager.
 *
 * Counts and short lists only, each read from the service or query its own
 * screen uses, so the Dashboard never tells a different story from the
 * Licenses, Surveys or Checklists screens. Survey answers are never read
 * here: only how many there are, as the Surveys screen shows.
 */
@Injectable()
export class PracticeOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly surveys: SurveysService,
  ) {}

  async overview() {
    const today = practiceToday();
    const [surveys, suggestions, licenses, checklists, closing, waiting] = await Promise.all([
      this.surveys.overview(),
      this.prisma.feedback.count({ where: { receivedOn: { gte: addUtcDays(today, -30) } } }),
      this.licenses(),
      this.checklists(today),
      this.closing(today),
      this.waiting(),
    ]);
    return {
      surveys: { surveys, suggestionsLast30Days: suggestions },
      licenses,
      checklists,
      closing,
      waiting,
    };
  }

  private async licenses() {
    const [{ expired, expiringSoon, withinDays }, standing] = await Promise.all([
      this.credentials.expiring(),
      loadStanding(this.prisma),
    ]);
    const name = (person: { firstName: string; lastName: string; preferredName: string | null }) =>
      `${person.preferredName ?? person.firstName} ${person.lastName}`;
    const missing = standing.flatMap((person) =>
      person.lines
        .filter((line) => line.required && line.state === 'MISSING')
        .map((line) => ({ employeeName: name(person.employee), name: line.type.name })),
    );
    const item = (row: (typeof expired)[number]) => ({
      employeeName: name(row.employee),
      name: row.name,
      expiresOn: row.expiresOn,
      daysUntilExpiry: row.daysUntilExpiry,
    });
    return {
      withinDays,
      expired: expired.map(item),
      dueSoon: expiringSoon.map(item),
      missingRequired: missing,
    };
  }

  /// Onboarding and offboarding still under way: how far along, and what is late.
  private async checklists(today: Date) {
    const open = await this.prisma.employeeChecklist.findMany({
      where: { completedAt: null },
      select: {
        id: true,
        kind: true,
        name: true,
        anchorDate: true,
        employee: { select: { firstName: true, lastName: true, preferredName: true } },
        tasks: { select: { status: true, dueAt: true } },
      },
      orderBy: { anchorDate: 'asc' },
    });
    return open.map((checklist) => ({
      id: checklist.id,
      kind: checklist.kind,
      name: checklist.name,
      employeeName: `${checklist.employee.preferredName ?? checklist.employee.firstName} ${checklist.employee.lastName}`,
      total: checklist.tasks.length,
      done: checklist.tasks.filter((task) => task.status !== ChecklistTaskStatus.PENDING).length,
      overdue: checklist.tasks.filter(
        (task) =>
          task.status === ChecklistTaskStatus.PENDING && task.dueAt !== null && task.dueAt < today,
      ).length,
    }));
  }

  /// Closing checklists over the last week, and supplies still to order.
  private async closing(today: Date) {
    const [records, supplies] = await Promise.all([
      this.prisma.closingRecord.findMany({
        where: { day: { gte: addUtcDays(today, -(CLOSING_DAYS - 1)) } },
        select: { submitted: true, gaps: true, location: { select: { name: true } } },
      }),
      this.prisma.supplyRequest.findMany({
        where: { orderedAt: null },
        select: { location: { select: { name: true } } },
      }),
    ]);
    const byOffice = new Map<string, number>();
    for (const supply of supplies) {
      byOffice.set(supply.location.name, (byOffice.get(supply.location.name) ?? 0) + 1);
    }
    return {
      days: CLOSING_DAYS,
      total: records.length,
      complete: records.filter((record) => record.submitted && record.gaps === 0).length,
      withGaps: records.filter((record) => record.submitted && record.gaps > 0).length,
      skipped: records.filter((record) => !record.submitted).length,
      suppliesToOrder: [...byOffice.entries()].map(([office, count]) => ({ office, count })),
    };
  }

  /// What is sitting with a manager to do.
  private async waiting() {
    const [timeOff, handEntries, unapproved, missingPunches] = await Promise.all([
      this.prisma.ptoRequest.count({ where: { status: PtoStatus.PENDING } }),
      this.prisma.timeEntry.count({
        where: { enteredByHandAt: { not: null }, handEntryCheckedAt: null },
      }),
      this.prisma.timeEntry.count({
        where: { status: TimeEntryStatus.COMPLETED, clockOutAt: { not: null } },
      }),
      this.prisma.timeEntry.count({
        where: {
          clockOutAt: null,
          clockInAt: { lt: practiceDayStart() },
          employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
        },
      }),
    ]);
    return { timeOff, handEntries, unapprovedHours: unapproved, missingPunches };
  }
}
