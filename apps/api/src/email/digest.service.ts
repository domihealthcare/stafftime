import { Injectable, Logger } from '@nestjs/common';
import { EmploymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttentionService, type DigestContents } from './attention.service';
import { NotificationsService } from './notifications.service';

export type { DigestContents };

/**
 * The nightly round-up.
 *
 * What goes in it is `AttentionService`'s job — the same list the banners on
 * the screens read, so the email and the app cannot disagree. This is only
 * about sending it.
 *
 * It goes to managers and admins who have not turned it off, and **only when
 * there is something to say**. A daily email that is usually empty gets
 * filtered into a folder within a fortnight, and then the one that matters goes
 * there too.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly attention: AttentionService,
  ) {}

  async send(): Promise<{ sent: number; contents: DigestContents }> {
    const contents = await this.attention.gather();
    const itemCount = Object.values(contents).reduce((sum, list) => sum + list.length, 0);

    if (itemCount === 0) {
      this.logger.log('Nothing to chase today — no digest sent');
      return { sent: 0, contents };
    }

    const recipients = await this.prisma.employee.findMany({
      where: {
        role: { in: [Role.MANAGER, Role.ADMIN] },
        employmentStatus: EmploymentStatus.ACTIVE,
        // Theirs to turn off. Everything in the digest is also on the screen it
        // belongs to, so opting out loses the nudge, not the information.
        wantsDailyDigest: true,
      },
      select: { email: true, firstName: true },
    });

    if (recipients.length === 0) {
      this.logger.log(`${itemCount} item(s) to chase, but nobody is subscribed to the digest`);
      return { sent: 0, contents };
    }

    for (const recipient of recipients) {
      await this.notifications.dailyDigest(recipient.email, recipient.firstName, contents);
    }

    this.logger.log(`Digest of ${itemCount} item(s) sent to ${recipients.length} manager(s)`);
    return { sent: recipients.length, contents };
  }
}
