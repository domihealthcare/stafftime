import { Injectable, Logger } from '@nestjs/common';
import { DigestTopic, EmploymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttentionService, type DigestContents } from './attention.service';
import { ALL_DIGEST_TOPICS, DIGEST_TOPICS, contentsFor, readersOf } from './digest-topics';
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
 *
 * Each of them gets only the parts they are down for (`digest-topics.ts`), and
 * a part nobody is down for goes to all of them. Somebody whose parts all have
 * nothing in them tonight is not emailed.
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
      select: { email: true, firstName: true, mutedDigestTopics: true },
    });

    if (recipients.length === 0) {
      this.logger.log(`${itemCount} item(s) to chase, but nobody is subscribed to the digest`);
      return { sent: 0, contents };
    }

    // Who reads which part tonight. Only parts with something in them count:
    // an empty part with nobody down for it is no reason to email anybody.
    const topicsFor = new Map(recipients.map((recipient) => [recipient, new Set<DigestTopic>()]));
    for (const topic of ALL_DIGEST_TOPICS) {
      if (DIGEST_TOPICS[topic].every((key) => contents[key].length === 0)) continue;
      for (const reader of readersOf(topic, recipients)) topicsFor.get(reader)!.add(topic);
    }

    let sent = 0;
    for (const [recipient, topics] of topicsFor) {
      if (topics.size === 0) continue;
      await this.notifications.dailyDigest(
        recipient.email,
        recipient.firstName,
        contentsFor(contents, topics),
      );
      sent += 1;
    }

    this.logger.log(`Digest of ${itemCount} item(s) sent to ${sent} manager(s)`);
    return { sent, contents };
  }
}
