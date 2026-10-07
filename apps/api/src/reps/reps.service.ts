import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PracticeEventKind } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RepInput } from './dto/rep.dto';
import { repLunchTitle } from './rep-lunch-title';

/**
 * The reps who book lunches (October 2026, Dominguez): name — what matters
 * most, as they do the scheduling — cell phone, company, medication, catering
 * or self-order, how welcome they are, and notes. Managers and admins keep the
 * list; nobody else reads it whole.
 */
@Injectable()
export class RepsService {
  private readonly logger = new Logger(RepsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Everybody on the list, by name, with their last and next lunch.
  async list(now = new Date()) {
    const reps = await this.prisma.rep.findMany({ orderBy: { name: 'asc' } });
    const lunches = await this.prisma.practiceEvent.findMany({
      where: { kind: PracticeEventKind.REP_LUNCH, repId: { not: null } },
      select: { repId: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
    });
    return reps.map((rep) => {
      const theirs = lunches.filter((lunch) => lunch.repId === rep.id);
      return {
        ...rep,
        lastLunch: [...theirs].reverse().find((lunch) => lunch.startsAt <= now)?.startsAt ?? null,
        nextLunch: theirs.find((lunch) => lunch.startsAt > now)?.startsAt ?? null,
      };
    });
  }

  async create(dto: RepInput, actor: AuthUser) {
    const rep = await this.prisma.rep.create({ data: clean(dto) });
    this.logger.log(`Rep ${rep.id} added by ${actor.id}`);
    return rep;
  }

  async update(id: string, dto: RepInput, actor: AuthUser) {
    await this.require(id);
    const data = clean(dto);
    const [rep] = await this.prisma.$transaction([
      this.prisma.rep.update({ where: { id }, data }),
      // Their lunches are named after them, so a corrected name follows.
      this.prisma.practiceEvent.updateMany({
        where: { repId: id, kind: PracticeEventKind.REP_LUNCH },
        data: { title: repLunchTitle(data.name) },
      }),
    ]);
    this.logger.log(`Rep ${id} changed by ${actor.id}`);
    return rep;
  }

  /// Off the list. Their lunches stay on the calendar, still named.
  async remove(id: string, actor: AuthUser) {
    await this.require(id);
    await this.prisma.rep.delete({ where: { id } });
    this.logger.log(`Rep ${id} removed by ${actor.id}`);
    return { removed: true };
  }

  private async require(id: string) {
    const rep = await this.prisma.rep.findUnique({ where: { id }, select: { id: true } });
    if (!rep) throw new NotFoundException('That rep is no longer on the list.');
  }
}

/// Trimmed, with blanks stored as nothing.
function clean(dto: RepInput) {
  const text = (value: string | undefined) => value?.trim() || null;
  return {
    name: dto.name.trim(),
    company: text(dto.company),
    medication: text(dto.medication),
    cellPhone: text(dto.cellPhone),
    food: dto.food ?? null,
    status: dto.status,
    notes: text(dto.notes),
  };
}
