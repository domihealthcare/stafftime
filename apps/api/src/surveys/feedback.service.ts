import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { localDateIn } from '../common/util/zoned-time.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The suggestion box. Anybody signed in can post; managers read it.
 *
 * Nothing about the sender is kept — not their id, not the time of day. The
 * session is needed to post (so the box is not open to the internet), and is
 * then thrown away.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async post(message: string, now = new Date()) {
    await this.prisma.feedback.create({
      data: {
        message: message.trim(),
        receivedOn: new Date(`${localDateIn(now, 'America/New_York')}T00:00:00Z`),
      },
    });
    this.logger.log('Anonymous feedback received');
    return { received: true };
  }

  list(archived: boolean) {
    return this.prisma.feedback.findMany({
      where: { archivedAt: archived ? { not: null } : null },
      orderBy: [{ receivedOn: 'desc' }, { id: 'asc' }],
    });
  }

  async archive(id: string) {
    const row = await this.prisma.feedback.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That message does not exist.');
    return this.prisma.feedback.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
