import { Injectable, Logger } from '@nestjs/common';
import {
  ChecklistTaskStatus,
  EmploymentStatus,
  PtoStatus,
  Role,
  TimeEntryStatus,
} from '@prisma/client';
import { addUtcDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/// How far ahead the digest looks for credentials about to lapse. Long enough
/// to renew a state licence without rushing.
const CREDENTIAL_HORIZON_DAYS = 60;

/// How far back it looks for punches nobody has sorted out. A fortnight covers
/// a pay period; older than that and chasing it daily is nagging, not helping.
const MISSING_PUNCH_DAYS = 14;

export interface DigestContents {
  expiredCredentials: string[];
  expiringCredentials: string[];
  overdueTasks: string[];
  missingPunches: string[];
  undecidedTimeOff: string[];
}

/**
 * The nightly round-up.
 *
 * Everything in here is something the app already knows and nobody would find
 * out about unless they went looking: a licence that lapsed last week, a
 * checklist task a fortnight overdue, a punch with no clock-out, a time-off
 * request sitting undecided.
 *
 * It only goes to managers and admins, and **only when there is something to
 * say**. A daily email that is usually empty gets filtered into a folder within
 * a fortnight, and then the one that matters goes there too.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(): Promise<{ sent: number; contents: DigestContents }> {
    const contents = await this.gather();
    const itemCount = Object.values(contents).reduce((sum, list) => sum + list.length, 0);

    if (itemCount === 0) {
      this.logger.log('Nothing to chase today — no digest sent');
      return { sent: 0, contents };
    }

    const recipients = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.MANAGER, Role.ADMIN] },
        employmentStatus: EmploymentStatus.ACTIVE,
      },
      select: { email: true, firstName: true },
    });

    for (const recipient of recipients) {
      this.notifications.dailyDigest(recipient.email, recipient.firstName, contents);
    }

    this.logger.log(`Digest of ${itemCount} item(s) sent to ${recipients.length} manager(s)`);
    return { sent: recipients.length, contents };
  }

  async gather(): Promise<DigestContents> {
    const today = toUtcDate(isoDate(new Date()));

    const [credentials, tasks, punches, timeOff] = await Promise.all([
      this.prisma.employeeCredential.findMany({
        where: {
          archivedAt: null,
          expiresOn: { lte: addUtcDays(today, CREDENTIAL_HORIZON_DAYS) },
          employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
        },
        select: {
          name: true,
          expiresOn: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { expiresOn: 'asc' },
      }),

      this.prisma.employeeChecklistTask.findMany({
        where: {
          status: ChecklistTaskStatus.PENDING,
          dueAt: { lt: today },
          checklist: {
            completedAt: null,
            employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
          },
        },
        select: {
          title: true,
          dueAt: true,
          checklist: {
            select: { employee: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { dueAt: 'asc' },
        take: 20,
      }),

      this.prisma.timeEntry.findMany({
        where: {
          clockOutAt: null,
          clockInAt: { lt: today, gte: addUtcDays(today, -MISSING_PUNCH_DAYS) },
          status: { not: TimeEntryStatus.APPROVED },
        },
        select: {
          clockInAt: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { clockInAt: 'asc' },
        take: 20,
      }),

      this.prisma.ptoRequest.findMany({
        where: { status: PtoStatus.PENDING },
        select: {
          startDate: true,
          endDate: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 20,
      }),
    ]);

    const who = (person: { firstName: string; lastName: string }) =>
      `${person.firstName} ${person.lastName}`;
    const day = (date: Date) =>
      date.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

    const expired = credentials.filter((row) => row.expiresOn < today);
    const expiring = credentials.filter((row) => row.expiresOn >= today);

    return {
      expiredCredentials: expired.map(
        (row) => `${who(row.employee)} — ${row.name}, expired ${day(row.expiresOn)}`,
      ),
      expiringCredentials: expiring.map(
        (row) => `${who(row.employee)} — ${row.name}, expires ${day(row.expiresOn)}`,
      ),
      overdueTasks: tasks.map(
        (row) =>
          `${who(row.checklist.employee)} — ${row.title}${
            row.dueAt ? `, due ${day(row.dueAt)}` : ''
          }`,
      ),
      missingPunches: punches.map(
        (row) => `${who(row.employee)} — clocked in ${day(row.clockInAt)} and never out`,
      ),
      undecidedTimeOff: timeOff.map(
        (row) =>
          `${who(row.employee)} — ${day(row.startDate)}${
            row.startDate.getTime() === row.endDate.getTime() ? '' : ` to ${day(row.endDate)}`
          }`,
      ),
    };
  }
}
