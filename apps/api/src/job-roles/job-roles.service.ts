import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobRoleDto, UpdateJobRoleDto } from './dto/job-role.dto';
import { nextFreeColour } from './job-role-colours';

const JOB_ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  sortOrder: true,
  colour: true,
  seesOwnPersonnelTabs: true,
  _count: { select: { resources: true } },
  members: {
    // Somebody who has left is not "in" Front Desk any more, even if nobody
    // has tidied the list. They come back if they are rehired.
    where: { employee: { employmentStatus: { not: EmploymentStatus.TERMINATED } } },
    select: {
      employee: {
        select: { id: true, firstName: true, lastName: true, preferredName: true },
      },
    },
    orderBy: { employee: { firstName: 'asc' } },
  },
} satisfies Prisma.JobRoleSelect;

type JobRoleRow = Prisma.JobRoleGetPayload<{ select: typeof JOB_ROLE_SELECT }>;

/**
 * What people do at the practice, and who does it.
 *
 * Managers keep this list. It decides which resources somebody sees — and
 * nothing about what they may do in the app, which is `Employee.role` and
 * stays an admin's decision. See the JobRole model for why the two are apart.
 */
@Injectable()
export class JobRolesService {
  private readonly logger = new Logger(JobRolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.jobRole.findMany({
      select: JOB_ROLE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(present);
  }

  async findOne(id: string) {
    const row = await this.prisma.jobRole.findUnique({ where: { id }, select: JOB_ROLE_SELECT });
    if (!row) throw new NotFoundException('That job role does not exist.');
    return present(row);
  }

  async create(dto: CreateJobRoleDto, actor: AuthUser) {
    const name = dto.name.trim();
    await this.assertNameFree(name);

    // New roles go to the end of the list; managers can reorder afterwards.
    const last = await this.prisma.jobRole.aggregate({ _max: { sortOrder: true } });
    // Unless the manager picked one, a new role gets a colour nobody else has.
    const colour =
      dto.colour ??
      nextFreeColour(
        (await this.prisma.jobRole.findMany({ select: { colour: true } })).map((row) => row.colour),
      );

    const row = await this.prisma.jobRole.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
        colour,
        seesOwnPersonnelTabs: dto.seesOwnPersonnelTabs ?? false,
      },
      select: JOB_ROLE_SELECT,
    });
    this.logger.log(`Job role ${row.id} (${name}) created by ${actor.id}`);
    return present(row);
  }

  async update(id: string, dto: UpdateJobRoleDto, actor: AuthUser) {
    await this.findOne(id);
    const name = dto.name?.trim();
    if (name !== undefined) await this.assertNameFree(name, id);

    const row = await this.prisma.jobRole.update({
      where: { id },
      data: {
        name,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        sortOrder: dto.sortOrder,
        colour: dto.colour,
        seesOwnPersonnelTabs: dto.seesOwnPersonnelTabs,
      },
      select: JOB_ROLE_SELECT,
    });
    this.logger.log(`Job role ${id} updated by ${actor.id}`);
    return present(row);
  }

  /// Removing a role takes its members with it — they simply stop being in
  /// it — but not its resources: those were written for somebody, and deleting
  /// a role should not silently throw that work away.
  async remove(id: string, actor: AuthUser) {
    const role = await this.findOne(id);
    if (role.resourceCount > 0) {
      throw new BadRequestException(
        `${role.name} still has ${role.resourceCount} resource${
          role.resourceCount === 1 ? '' : 's'
        }. Move or delete ${role.resourceCount === 1 ? 'it' : 'them'} first.`,
      );
    }
    await this.prisma.jobRole.delete({ where: { id } });
    this.logger.log(`Job role ${id} (${role.name}) deleted by ${actor.id}`);
    return { deleted: true };
  }

  async addMember(id: string, employeeId: string, actor: AuthUser) {
    await this.findOne(id);
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('That employee does not exist.');

    // Adding somebody twice is not an error: they are in it, which is what was asked.
    await this.prisma.employeeJobRole.upsert({
      where: { employeeId_jobRoleId: { employeeId, jobRoleId: id } },
      update: {},
      create: { employeeId, jobRoleId: id },
    });
    this.logger.log(`Employee ${employeeId} added to job role ${id} by ${actor.id}`);
    return this.findOne(id);
  }

  async removeMember(id: string, employeeId: string, actor: AuthUser) {
    await this.findOne(id);
    await this.prisma.employeeJobRole.deleteMany({ where: { employeeId, jobRoleId: id } });
    this.logger.log(`Employee ${employeeId} removed from job role ${id} by ${actor.id}`);
    return this.findOne(id);
  }

  /// The job roles somebody holds — what decides which resources they see.
  async idsFor(employeeId: string): Promise<string[]> {
    const rows = await this.prisma.employeeJobRole.findMany({
      where: { employeeId },
      select: { jobRoleId: true },
    });
    return rows.map((row) => row.jobRoleId);
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.jobRole.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`There is already a job role called ${name}.`);
  }
}

function present(row: JobRoleRow) {
  const { _count, members, ...rest } = row;
  return {
    ...rest,
    resourceCount: _count.resources,
    members: members.map((member) => member.employee),
  };
}
