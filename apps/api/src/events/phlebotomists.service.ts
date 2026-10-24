import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/// The plain title of a phlebotomist date saved with no name.
export const PHLEBOTOMIST = 'Phlebotomist';

/**
 * The phlebotomists' names (October 2026, Dominguez: "put it so i can reuse
 * the name in future scheduling (should be able to delete name as well)").
 * Every name a phlebotomist date is saved with is kept, to pick next time;
 * managers remove one from the event form. A date keeps the name as its own
 * title, so removing a name changes no date already on the calendar.
 */
@Injectable()
export class PhlebotomistsService {
  private readonly logger = new Logger(PhlebotomistsService.name);

  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.phlebotomist.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /// Kept for next time, once however it is capitalised. The plain
  /// "Phlebotomist" is not a name.
  async remember(name: string): Promise<void> {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.toLowerCase() === PHLEBOTOMIST.toLowerCase()) return;
    const known = await this.prisma.phlebotomist.count({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (known > 0) return;
    try {
      await this.prisma.phlebotomist.create({ data: { name: trimmed } });
    } catch (error) {
      // Two saves at once: the other one kept it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }

  async remove(id: string, actor: AuthUser) {
    const found = await this.prisma.phlebotomist.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('That name is no longer on the list.');
    await this.prisma.phlebotomist.delete({ where: { id } });
    this.logger.log(`Phlebotomist name ${id} removed by ${actor.id}`);
    return { removed: true };
  }
}
