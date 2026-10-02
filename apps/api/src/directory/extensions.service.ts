import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionLineInput } from './dto/extension.dto';

/**
 * The office extensions list (October 2026, Dominguez — from the practice's
 * "Office Extensions" sheet). Everybody signed in reads it in the Directory;
 * managers and admins keep it.
 *
 * Saved as a whole, in the order on screen: it is one short list that a
 * manager rearranges and corrects in one go, like the sheet it replaced.
 */
@Injectable()
export class ExtensionsService {
  private readonly logger = new Logger(ExtensionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.officeExtension.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        section: true,
        label: true,
        extension: true,
        homeExtension: true,
        homeDays: true,
        employeeId: true,
      },
    });
  }

  async save(lines: ExtensionLineInput[], actor: AuthUser) {
    const clean = lines.map((line, index) => ({
      section: line.section.trim(),
      label: line.label.trim(),
      extension: line.extension.trim(),
      homeExtension: line.homeExtension?.trim() || null,
      homeDays: line.homeDays?.trim() || null,
      employeeId: line.employeeId ?? null,
      sortOrder: (index + 1) * 10,
    }));
    for (const line of clean) {
      if (!line.section || !line.label) {
        throw new BadRequestException('Every line needs a section and a name.');
      }
    }

    const people = [...new Set(clean.map((line) => line.employeeId).filter(Boolean))] as string[];
    if (people.length > 0) {
      const found = await this.prisma.employee.count({ where: { id: { in: people } } });
      if (found !== people.length) {
        throw new BadRequestException('One of the people matched to a line does not exist.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.officeExtension.deleteMany({}),
      this.prisma.officeExtension.createMany({ data: clean }),
    ]);
    this.logger.log(`Office extensions saved by ${actor.id}: ${clean.length} lines`);
    return this.list();
  }
}
