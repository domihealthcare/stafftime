import { Injectable, Logger } from '@nestjs/common';
import { CredentialReminderStage, EmploymentStatus, Prisma } from '@prisma/client';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { addDaysTo, localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import { dueReminders, LAPSED_FOR_DAYS, reminderWording } from '../credentials/license-reminders';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tells people about their own licenses running out — see
 * `credentials/license-reminders.ts` for when and why. Run by the nightly job.
 * Each reminder is recorded (`CredentialReminder`) before it is sent, so a
 * second run the same night sends nothing more.
 */
@Injectable()
export class LicenseRemindersService {
  private readonly logger = new Logger(LicenseRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(now: Date = new Date()): Promise<number> {
    const today = localDateIn(now, PRACTICE_ZONE);
    const rows = await this.prisma.employeeCredential.findMany({
      where: {
        archivedAt: null,
        // Enough either side to see renewals recorded beside the old card.
        expiresOn: {
          gte: toUtcDate(addDaysTo(today, -LAPSED_FOR_DAYS)),
        },
        employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        credentialTypeId: true,
        expiresOn: true,
        credentialType: { select: { name: true } },
      },
    });

    const due = dueReminders(
      rows.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        name: row.name,
        credentialTypeId: row.credentialTypeId,
        typeName: row.credentialType?.name ?? null,
        expiresOn: isoDate(row.expiresOn),
      })),
      today,
    );

    let sent = 0;
    for (const { credential, stage, daysLeft } of due) {
      if (!(await this.claim(credential.id, stage, credential.expiresOn))) continue;
      await this.notifications.licenseReminder(
        credential.employeeId,
        reminderWording(credential.name, stage, daysLeft, credential.expiresOn),
      );
      sent += 1;
    }
    if (sent > 0) this.logger.log(`Reminded ${sent} people about their own licenses`);
    return sent;
  }

  /// Records the reminder; false when it was already sent for this date.
  private async claim(
    credentialId: string,
    stage: CredentialReminderStage,
    expiresOn: string,
  ): Promise<boolean> {
    try {
      await this.prisma.credentialReminder.create({
        data: { credentialId, stage, expiresOn: toUtcDate(expiresOn) },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}
