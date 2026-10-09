import { Injectable, Logger } from '@nestjs/common';
import {
  ChecklistKind,
  ChecklistReminderStage,
  ChecklistTaskStatus,
  EmploymentStatus,
  Prisma,
  TaskOwner,
} from '@prisma/client';
import { isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { addDaysTo, localDateIn, PRACTICE_ZONE } from '../common/util/zoned-time.util';
import {
  DUE_SOON_DAYS,
  DueTaskReminder,
  dueTaskReminders,
  OVERDUE_FOR_DAYS,
  taskReminderWording,
} from '../checklists/onboarding-reminders';
import { NotificationsService } from '../email/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tells new hires about their own onboarding tasks coming due, or overdue —
 * see `checklists/onboarding-reminders.ts` for when and why. Run by the
 * five-minute timer and, as a fallback, the nightly job. Each reminder is
 * recorded (`ChecklistTaskReminder`) before it is sent, so a second run sends
 * nothing more; a person with several due at once gets one message.
 */
@Injectable()
export class OnboardingRemindersService {
  private readonly logger = new Logger(OnboardingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(now: Date = new Date()): Promise<number> {
    const today = localDateIn(now, PRACTICE_ZONE);
    const rows = await this.prisma.employeeChecklistTask.findMany({
      where: {
        owner: TaskOwner.EMPLOYEE,
        status: ChecklistTaskStatus.PENDING,
        dueAt: {
          gte: toUtcDate(addDaysTo(today, -OVERDUE_FOR_DAYS)),
          lte: toUtcDate(addDaysTo(today, DUE_SOON_DAYS)),
        },
        checklist: {
          kind: ChecklistKind.ONBOARDING,
          completedAt: null,
          employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } },
        },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        checklist: { select: { employeeId: true, createdAt: true } },
      },
    });

    const due = dueTaskReminders(
      rows.flatMap((row) =>
        row.dueAt
          ? [
              {
                id: row.id,
                employeeId: row.checklist.employeeId,
                title: row.title,
                dueOn: isoDate(row.dueAt),
                checklistStartedOn: localDateIn(row.checklist.createdAt, PRACTICE_ZONE),
              },
            ]
          : [],
      ),
      today,
    );

    const byPerson = new Map<string, DueTaskReminder[]>();
    for (const reminder of due) {
      if (!(await this.claim(reminder.task.id, reminder.stage, reminder.task.dueOn))) continue;
      const theirs = byPerson.get(reminder.task.employeeId) ?? [];
      theirs.push(reminder);
      byPerson.set(reminder.task.employeeId, theirs);
    }
    for (const [employeeId, reminders] of byPerson) {
      await this.notifications.onboardingReminder(employeeId, taskReminderWording(reminders));
    }
    if (byPerson.size > 0) {
      this.logger.log(`Reminded ${byPerson.size} people about their onboarding tasks`);
    }
    return byPerson.size;
  }

  /// Records the reminder; false when it was already sent for this due date.
  private async claim(
    taskId: string,
    stage: ChecklistReminderStage,
    dueOn: string,
  ): Promise<boolean> {
    try {
      await this.prisma.checklistTaskReminder.create({
        data: { taskId, stage, dueAt: toUtcDate(dueOn) },
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
