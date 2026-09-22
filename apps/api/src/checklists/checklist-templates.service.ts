import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChecklistKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/checklist.dto';

const TEMPLATE_INCLUDE = {
  tasks: { orderBy: { position: 'asc' } },
} satisfies Prisma.ChecklistTemplateInclude;

@Injectable()
export class ChecklistTemplatesService {
  private readonly logger = new Logger(ChecklistTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(kind?: ChecklistKind, includeArchived = false) {
    return this.prisma.checklistTemplate.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: TEMPLATE_INCLUDE,
      orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('That template does not exist.');
    return template;
  }

  async create(dto: CreateTemplateDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, dto.kind);

      const template = await tx.checklistTemplate.create({
        data: {
          kind: dto.kind,
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault ?? false,
          createdById: actorId,
          tasks: { create: dto.tasks.map(toTaskRow) },
        },
        include: TEMPLATE_INCLUDE,
      });

      this.logger.log(`Checklist template ${template.id} (${template.name}) created`);
      return template;
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.findOne(id);
    if (existing.archivedAt) {
      throw new BadRequestException(
        'That template is retired. Make a new one rather than editing it.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, existing.kind);

      // The task list is replaced wholesale. Existing checklists are snapshots
      // and are untouched by this, which is the whole point of snapshotting
      // them: rewording a task must not rewrite what someone already signed.
      if (dto.tasks) {
        await tx.checklistTemplateTask.deleteMany({ where: { templateId: id } });
      }

      const template = await tx.checklistTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
          ...(dto.tasks ? { tasks: { create: dto.tasks.map(toTaskRow) } } : {}),
        },
        include: TEMPLATE_INCLUDE,
      });

      this.logger.log(`Checklist template ${id} updated`);
      return template;
    });
  }

  /// Templates are archived, never deleted, so a finished checklist can still
  /// say where it came from.
  async archive(id: string) {
    const existing = await this.findOne(id);
    if (existing.archivedAt) return existing;

    const template = await this.prisma.checklistTemplate.update({
      where: { id },
      data: { archivedAt: new Date(), isDefault: false },
      include: TEMPLATE_INCLUDE,
    });

    this.logger.log(`Checklist template ${id} archived`);
    return template;
  }

  async restore(id: string) {
    await this.findOne(id);
    return this.prisma.checklistTemplate.update({
      where: { id },
      data: { archivedAt: null },
      include: TEMPLATE_INCLUDE,
    });
  }

  private clearDefault(tx: Prisma.TransactionClient, kind: ChecklistKind) {
    return tx.checklistTemplate.updateMany({
      where: { kind, isDefault: true },
      data: { isDefault: false },
    });
  }
}

function toTaskRow(task: CreateTemplateDto['tasks'][number], index: number) {
  return {
    position: index,
    title: task.title,
    description: task.description,
    owner: task.owner,
    requiresDocument: task.requiresDocument ?? false,
    dueOffsetDays: task.dueOffsetDays,
  };
}
