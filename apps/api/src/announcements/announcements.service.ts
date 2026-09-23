import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  isPrimary: true,
  editedAt: true,
  createdAt: true,
  author: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
} satisfies Prisma.AnnouncementSelect;

/**
 * The staff noticeboard.
 *
 * One rule carries the weight: while any post exists, exactly one is primary,
 * because the home screen always has something at the top. "At most one" is a
 * partial unique index in the database; "at least one" is kept here, by moving
 * the flag from post to post and never simply clearing it.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Newest first, the primary among them where it falls — the News page reads
  /// like a blog, and the home screen shows the primary separately.
  findAll() {
    return this.prisma.announcement.findMany({
      select: ANNOUNCEMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /// Null only when nothing has been posted at all.
  findPrimary() {
    return this.prisma.announcement.findFirst({
      where: { isPrimary: true },
      select: ANNOUNCEMENT_SELECT,
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.announcement.findUnique({
      where: { id },
      select: ANNOUNCEMENT_SELECT,
    });
    if (!row) throw new NotFoundException('That announcement does not exist.');
    return row;
  }

  async create(dto: CreateAnnouncementDto, actor: AuthUser) {
    const row = await this.prisma.$transaction(async (tx) => {
      // The first post is primary whatever the form said: the rule is that
      // there always is one, and until now there was nothing to be it.
      const hasPrimary = (await tx.announcement.count({ where: { isPrimary: true } })) > 0;
      const isPrimary = !hasPrimary || dto.isPrimary === true;

      if (isPrimary && hasPrimary) {
        await tx.announcement.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.announcement.create({
        data: {
          title: dto.title.trim(),
          body: dto.body.trim(),
          isPrimary,
          authorId: actor.id,
        },
        select: ANNOUNCEMENT_SELECT,
      });
    });

    this.logger.log(
      `Announcement ${row.id} posted by ${actor.id}${row.isPrimary ? ' (primary)' : ''}`,
    );
    return row;
  }

  async update(id: string, dto: UpdateAnnouncementDto, actor: AuthUser) {
    const existing = await this.findOne(id);

    if (dto.isPrimary === false && existing.isPrimary) {
      throw new BadRequestException(
        'There always has to be a primary announcement. Make another one primary instead.',
      );
    }

    const title = dto.title?.trim();
    const body = dto.body?.trim();
    const wordsChanged =
      (title !== undefined && title !== existing.title) ||
      (body !== undefined && body !== existing.body);

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true && !existing.isPrimary) {
        await tx.announcement.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.announcement.update({
        where: { id },
        data: {
          title,
          body,
          ...(dto.isPrimary === true ? { isPrimary: true } : {}),
          ...(wordsChanged ? { editedAt: new Date() } : {}),
        },
        select: ANNOUNCEMENT_SELECT,
      });
    });

    this.logger.log(`Announcement ${id} updated by ${actor.id}`);
    return row;
  }

  async remove(id: string, actor: AuthUser) {
    const existing = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.announcement.delete({ where: { id } });

      // Deleting the primary hands it to the newest post left, so the home
      // screen is never left with a gap the admin did not choose.
      if (existing.isPrimary) {
        const next = await tx.announcement.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (next) {
          await tx.announcement.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
    });

    this.logger.log(`Announcement ${id} deleted by ${actor.id}`);
    return { deleted: true };
  }
}
