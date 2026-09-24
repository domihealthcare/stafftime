import { Injectable, Logger } from '@nestjs/common';
import { EmploymentStatus, NotificationKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// How long a notification is kept, read or not. Long enough to look back on
/// "when was my time off approved?"; short enough that the table does not
/// become a second, worse audit log.
export const NOTIFICATION_RETENTION_DAYS = 90;

/// How many the bell shows at once. Older ones are still there until they age
/// out; nobody scrolls back through more than this in a dropdown.
const LIST_LIMIT = 30;

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body?: string;
  /// A path inside the app, e.g. "/time-off".
  link?: string;
}

/**
 * The bell in the header: things the app wants one person to know.
 *
 * Written alongside the emails the app already sends — the same moments, the
 * same words — plus a few that are worth seeing in the app but not worth an
 * email (a new post, a survey to answer). Unlike the email, this works whether
 * or not an email provider is configured.
 *
 * Like the email, it is **fire and forget**: nothing waits on it and nothing
 * fails because of it. A time-off approval that errored because a
 * notification row could not be written would be the worse bug.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// One row per person. Never awaited by a request handler.
  async notify(employeeIds: string[], notification: NewNotification): Promise<void> {
    const ids = [...new Set(employeeIds)];
    if (ids.length === 0) return;
    // Awaited by every caller, and never throws: on a serverless host anything
    // still running after the response is sent may simply never finish, and a
    // bell entry that failed to save must not fail the change it is about.
    try {
      await this.prisma.notification.createMany({
        data: ids.map((employeeId) => ({
          employeeId,
          kind: notification.kind,
          title: notification.title,
          body: notification.body ?? null,
          link: notification.link ?? null,
        })),
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not record a ${notification.kind} notification: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /// Everybody still working here, for practice-wide news.
  async notifyEveryone(notification: NewNotification, except?: string): Promise<void> {
    const people = await this.prisma.employee.findMany({
      where: {
        employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] },
        id: except ? { not: except } : undefined,
      },
      select: { id: true },
    });
    await this.notify(
      people.map((person) => person.id),
      notification,
    );
  }

  /// The newest first, and how many are unread in all.
  async list(employeeId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          link: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.unreadCount(employeeId),
    ]);
    return { items, unread };
  }

  unreadCount(employeeId: string): Promise<number> {
    return this.prisma.notification.count({ where: { employeeId, readAt: null } });
  }

  /// Only ever your own: the id alone is not enough.
  async markRead(employeeId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, employeeId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unread: await this.unreadCount(employeeId) };
  }

  async markAllRead(employeeId: string) {
    await this.prisma.notification.updateMany({
      where: { employeeId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unread: 0 };
  }

  /// For the nightly job.
  async purgeOld(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
    const result = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
