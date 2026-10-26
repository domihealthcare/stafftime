import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GuideKey } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { moveInOrder } from '../common/util/move-in-order';
import { PrismaService } from '../prisma/prisma.service';
import { GuideSectionInput } from './dto/guides.dto';
import { ToolAccessService } from '../tool-access/tool-access.service';
import { GUIDES_FOR_EVERYONE, GUIDE_LABELS, GUIDE_SLUGS, canEditGuide } from './guides';

/**
 * The practice's guides (October 2026, Dominguez): the Front Desk Cheat
 * Sheet, the Domi Playbook and the inpatient note templates, brought out of
 * Word into the app so they can be searched, copied from and kept up to date
 * in one place. Each is a list of sections in a light markup the web app
 * draws (`guides/guide-markup.ts` there). Small enough to send whole.
 */
@Injectable()
export class GuidesService {
  private readonly logger = new Logger(GuidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolAccess: ToolAccessService,
  ) {}

  keyOf(slug: string): GuideKey {
    const key = GUIDE_SLUGS[slug];
    if (!key) throw new NotFoundException('There is no such guide.');
    return key;
  }

  /// Read by whoever the guide is set up for (Resources, "Who can use it").
  async guide(slug: string, user: AuthUser) {
    const key = this.keyOf(slug);
    if (!GUIDES_FOR_EVERYONE.includes(key)) {
      await this.toolAccess.assertCanUse(user, slug, GUIDE_LABELS[slug]);
    }
    return this.read(key, user);
  }

  private async read(key: GuideKey, user: AuthUser) {
    const sections = await this.prisma.guideSection.findMany({
      where: { guide: key },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, group: true, title: true, body: true, updatedAt: true },
    });
    const updatedAt = sections.reduce<Date | null>(
      (latest, section) => (!latest || section.updatedAt > latest ? section.updatedAt : latest),
      null,
    );
    return { sections, updatedAt, canEdit: canEditGuide(user.role) };
  }

  async create(slug: string, dto: GuideSectionInput, user: AuthUser) {
    const key = this.keyOf(slug);
    const last = await this.prisma.guideSection.findFirst({
      where: { guide: key },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    // At the end of its heading's sections, or of the guide for a new heading.
    const inGroup = await this.prisma.guideSection.findFirst({
      where: { guide: key, group: dto.group.trim() },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = inGroup ? inGroup.sortOrder + 1 : (last?.sortOrder ?? 0) + 10;
    if (inGroup) {
      // Make room after the last section of that heading.
      await this.prisma.guideSection.updateMany({
        where: { guide: key, sortOrder: { gte: sortOrder } },
        data: { sortOrder: { increment: 1 } },
      });
    }
    await this.prisma.guideSection.create({
      data: { guide: key, ...this.clean(dto), sortOrder, updatedById: user.id },
    });
    this.logger.log(`Guide ${key}: section added by ${user.id}`);
    return this.read(key, user);
  }

  async update(id: string, dto: GuideSectionInput, user: AuthUser) {
    const section = await this.find(id);
    await this.prisma.guideSection.update({
      where: { id },
      data: { ...this.clean(dto), updatedById: user.id },
    });
    return this.read(section.guide, user);
  }

  async move(id: string, by: -1 | 1, user: AuthUser) {
    const section = await this.find(id);
    // Within its own heading only; a heading's place follows its first section.
    const siblings = await this.prisma.guideSection.findMany({
      where: { guide: section.guide },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, group: true },
    });
    const sameGroup = siblings.filter((row) => row.group === section.group).map((row) => row.id);
    const moved = moveInOrder(sameGroup, id, by);
    if (moved) {
      let next = 0;
      const order = siblings.map((row) => (row.group === section.group ? moved[next++] : row.id));
      await this.prisma.$transaction(
        order.map((sectionId, index) =>
          this.prisma.guideSection.update({
            where: { id: sectionId },
            data: { sortOrder: (index + 1) * 10 },
          }),
        ),
      );
    }
    return this.read(section.guide, user);
  }

  async remove(id: string, user: AuthUser) {
    const section = await this.find(id);
    await this.prisma.guideSection.delete({ where: { id } });
    this.logger.log(`Guide ${section.guide}: section ${id} removed by ${user.id}`);
    return this.read(section.guide, user);
  }

  private async find(id: string) {
    const section = await this.prisma.guideSection.findUnique({
      where: { id },
      select: { id: true, guide: true, group: true },
    });
    if (!section) throw new NotFoundException('That section is no longer in the guide.');
    return section;
  }

  private clean(dto: GuideSectionInput) {
    return {
      group: dto.group.trim(),
      title: dto.title.trim(),
      body: dto.body.replace(/\r\n/g, '\n').trimEnd(),
    };
  }
}
