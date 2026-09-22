import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistKind,
  ChecklistTaskStatus,
  Prisma,
  Role,
  TaskOwner,
} from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { addUtcDays, isoDate, toUtcDate } from '../common/util/calendar-date.util';
import { PrismaService } from '../prisma/prisma.service';
import { QueryChecklistsDto, StartChecklistDto, UpdateTaskDto } from './dto/checklist.dto';

const CHECKLIST_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      hireDate: true,
      terminationDate: true,
      employmentStatus: true,
    },
  },
  tasks: {
    orderBy: { position: 'asc' },
    include: {
      completedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.EmployeeChecklistInclude;

type ChecklistRow = Prisma.EmployeeChecklistGetPayload<{
  include: typeof CHECKLIST_INCLUDE;
}>;

@Injectable()
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Copies a template into a checklist for one person.
  ///
  /// The copy is the point. Referencing the template would mean that editing
  /// "sign the 2026 handbook" to say 2027 silently rewrites what forty people
  /// already signed off — and a signed acknowledgement of a document nobody can
  /// name any more is worth nothing in an audit.
  async start(dto: StartChecklistDto, actor: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        terminationDate: true,
      },
    });
    if (!employee) throw new NotFoundException('That employee does not exist.');

    const template = dto.templateId
      ? await this.prisma.checklistTemplate.findUnique({
          where: { id: dto.templateId },
          include: { tasks: { orderBy: { position: 'asc' } } },
        })
      : await this.prisma.checklistTemplate.findFirst({
          where: { kind: dto.kind, isDefault: true, archivedAt: null },
          include: { tasks: { orderBy: { position: 'asc' } } },
        });

    if (!template) {
      throw new BadRequestException(
        dto.templateId
          ? 'That template does not exist.'
          : `There is no default ${label(dto.kind)} template yet. Set one up first.`,
      );
    }
    if (template.kind !== dto.kind) {
      throw new BadRequestException(
        `That template is for ${label(template.kind)}, not ${label(dto.kind)}.`,
      );
    }
    if (template.tasks.length === 0) {
      throw new BadRequestException('That template has no tasks in it.');
    }

    const anchorDate = this.resolveAnchor(dto, employee);

    // One open checklist of each kind per person. A second one means two people
    // ticking off the same I-9 and neither knowing the other did it.
    const open = await this.prisma.employeeChecklist.findFirst({
      where: { employeeId: employee.id, kind: dto.kind, completedAt: null },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        `${employee.firstName} already has an unfinished ${label(dto.kind)} checklist.`,
      );
    }

    const checklist = await this.prisma.employeeChecklist.create({
      data: {
        employeeId: employee.id,
        kind: dto.kind,
        name: template.name,
        templateId: template.id,
        anchorDate,
        createdById: actor.id,
        tasks: {
          create: template.tasks.map((task, index) => ({
            position: index,
            title: task.title,
            description: task.description,
            owner: task.owner,
            dueAt:
              task.dueOffsetDays === null
                ? null
                : addUtcDays(anchorDate, task.dueOffsetDays),
          })),
        },
      },
      include: CHECKLIST_INCLUDE,
    });

    this.logger.log(
      `${label(dto.kind)} checklist ${checklist.id} started for employee ${employee.id}`,
    );
    return this.decorate(checklist);
  }

  async findAll(query: QueryChecklistsDto, actor: AuthUser) {
    // An employee's own checklist is theirs to see. Everybody else's is not.
    const employeeId =
      actor.role === Role.EMPLOYEE ? actor.id : query.employeeId;
    const state = query.state ?? 'open';

    const rows = await this.prisma.employeeChecklist.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(state === 'open' ? { completedAt: null } : {}),
        ...(state === 'completed' ? { completedAt: { not: null } } : {}),
      },
      include: CHECKLIST_INCLUDE,
      orderBy: [{ completedAt: 'asc' }, { anchorDate: 'desc' }],
    });

    return rows.map((row) => this.decorate(row));
  }

  async findOne(id: string, actor: AuthUser) {
    const checklist = await this.prisma.employeeChecklist.findUnique({
      where: { id },
      include: CHECKLIST_INCLUDE,
    });
    if (!checklist) throw new NotFoundException('That checklist does not exist.');

    if (actor.role === Role.EMPLOYEE && checklist.employeeId !== actor.id) {
      throw new ForbiddenException('That checklist is not yours.');
    }

    return this.decorate(checklist);
  }

  async updateTask(taskId: string, dto: UpdateTaskDto, actor: AuthUser) {
    const task = await this.prisma.employeeChecklistTask.findUnique({
      where: { id: taskId },
      include: {
        checklist: { select: { id: true, employeeId: true, kind: true } },
      },
    });
    if (!task) throw new NotFoundException('That task does not exist.');

    this.assertMayCompleteTask(task, actor);

    if (dto.status === ChecklistTaskStatus.NOT_APPLICABLE && !dto.note?.trim()) {
      throw new BadRequestException(
        'Say why it does not apply — a skipped task with no reason is worse than an unfinished one.',
      );
    }

    const done = dto.status !== ChecklistTaskStatus.PENDING;
    await this.prisma.employeeChecklistTask.update({
      where: { id: taskId },
      data: {
        status: dto.status,
        note: dto.note?.trim() || null,
        completedById: done ? actor.id : null,
        completedAt: done ? new Date() : null,
      },
    });

    await this.refreshCompletion(task.checklistId);
    return this.findOne(task.checklistId, actor);
  }

  /// Admin-only: a finished checklist is a record of what was done and when,
  /// so removing one is a deliberate act rather than a manager tidying up.
  async remove(id: string) {
    const checklist = await this.prisma.employeeChecklist.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!checklist) throw new NotFoundException('That checklist does not exist.');

    await this.prisma.employeeChecklist.delete({ where: { id } });

    this.logger.log(`Checklist ${id} deleted`);
    return { deleted: true };
  }

  /// Marks the checklist finished exactly when nothing is left pending, and
  /// un-finishes it if a task is reopened.
  private async refreshCompletion(checklistId: string) {
    const pending = await this.prisma.employeeChecklistTask.count({
      where: { checklistId, status: ChecklistTaskStatus.PENDING },
    });

    const current = await this.prisma.employeeChecklist.findUnique({
      where: { id: checklistId },
      select: { completedAt: true },
    });

    if (pending === 0 && !current?.completedAt) {
      await this.prisma.employeeChecklist.update({
        where: { id: checklistId },
        data: { completedAt: new Date() },
      });
      this.logger.log(`Checklist ${checklistId} completed`);
    } else if (pending > 0 && current?.completedAt) {
      await this.prisma.employeeChecklist.update({
        where: { id: checklistId },
        data: { completedAt: null },
      });
    }
  }

  /// Managers and admins run these checklists. An employee may tick off the
  /// items that are theirs to do — read the handbook, hand in a form — and
  /// nothing else, on their own checklist only.
  private assertMayCompleteTask(
    task: { owner: TaskOwner; checklist: { employeeId: string } },
    actor: AuthUser,
  ) {
    if (actor.role !== Role.EMPLOYEE) return;

    if (task.checklist.employeeId !== actor.id) {
      throw new ForbiddenException('That checklist is not yours.');
    }
    if (task.owner !== TaskOwner.EMPLOYEE) {
      throw new ForbiddenException(
        'That one is for a manager to complete, not you.',
      );
    }
  }

  private resolveAnchor(
    dto: StartChecklistDto,
    employee: { hireDate: Date; terminationDate: Date | null },
  ): Date {
    if (dto.anchorDate) return toUtcDate(dto.anchorDate);

    if (dto.kind === ChecklistKind.ONBOARDING) return employee.hireDate;

    if (!employee.terminationDate) {
      throw new BadRequestException(
        'Set their last day first, or give a date for the checklist to hang off.',
      );
    }
    return employee.terminationDate;
  }

  /// Everything the screens need that is arithmetic rather than storage.
  private decorate(checklist: ChecklistRow) {
    const total = checklist.tasks.length;
    const settled = checklist.tasks.filter(
      (task) => task.status !== ChecklistTaskStatus.PENDING,
    ).length;

    const today = toUtcDate(isoDate(new Date()));
    const overdue = checklist.tasks.filter(
      (task) =>
        task.status === ChecklistTaskStatus.PENDING &&
        task.dueAt !== null &&
        task.dueAt < today,
    );

    return {
      ...checklist,
      progress: {
        total,
        settled,
        pending: total - settled,
        percent: total === 0 ? 0 : Math.round((settled / total) * 100),
      },
      overdueCount: overdue.length,
      /// The soonest thing still outstanding, so a list of checklists can say
      /// what is actually holding each one up.
      nextTask:
        checklist.tasks.find(
          (task) => task.status === ChecklistTaskStatus.PENDING,
        )?.title ?? null,
    };
  }
}

function label(kind: ChecklistKind): string {
  return kind === ChecklistKind.ONBOARDING ? 'onboarding' : 'offboarding';
}
