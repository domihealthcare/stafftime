import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCredentialTypeDto, UpdateCredentialTypeDto } from './dto/credential-type.dto';
import { loadStanding } from './standing-query';

const TYPE_SELECT = {
  id: true,
  name: true,
  kind: true,
  renewalMonths: true,
  sortOrder: true,
  archivedAt: true,
  requirements: {
    select: {
      jobRoleId: true,
      required: true,
      jobRole: { select: { id: true, name: true, colour: true } },
    },
    orderBy: { jobRole: { sortOrder: 'asc' } },
  },
} satisfies Prisma.CredentialTypeSelect;

/**
 * The licenses and certificates the practice asks for, and which job roles
 * need each one — required or optional (Dominguez, September 2026). Managers
 * keep the list in the app: add a type, say who needs it and how often it is
 * renewed.
 *
 * `standing` puts that against what is on file for each person, which is
 * what the Licenses screen, the Staff editor, the nightly round-up and the
 * Dashboard all show.
 */
@Injectable()
export class CredentialTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeArchived = false) {
    return this.prisma.credentialType.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      select: TYPE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCredentialTypeDto) {
    const name = dto.name.trim();
    // Adding one that was removed brings it back, with what was on file
    // against it, rather than refusing the name.
    const removed = await this.prisma.credentialType.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, archivedAt: { not: null } },
      select: { id: true },
    });
    if (removed) {
      await this.prisma.credentialType.update({
        where: { id: removed.id },
        data: { archivedAt: null },
      });
      return this.update(removed.id, {
        name,
        kind: dto.kind,
        renewalMonths: dto.renewalMonths ?? null,
        requirements: dto.requirements ?? [],
      });
    }
    await this.assertNameFree(name);
    await this.assertRoles(dto.requirements ?? []);
    const last = await this.prisma.credentialType.aggregate({ _max: { sortOrder: true } });
    return this.prisma.credentialType.create({
      data: {
        name,
        kind: dto.kind,
        renewalMonths: dto.renewalMonths ?? null,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        requirements: {
          create: (dto.requirements ?? []).map((requirement) => ({
            jobRoleId: requirement.jobRoleId,
            required: requirement.required,
          })),
        },
      },
      select: TYPE_SELECT,
    });
  }

  async update(id: string, dto: UpdateCredentialTypeDto) {
    const existing = await this.prisma.credentialType.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('That license type does not exist.');
    const name = dto.name?.trim();
    if (name) await this.assertNameFree(name, id);
    if (dto.requirements) await this.assertRoles(dto.requirements);

    return this.prisma.$transaction(async (tx) => {
      // The list of who needs it is replaced whole: what the form shows is
      // what is saved.
      if (dto.requirements) {
        await tx.credentialRequirement.deleteMany({ where: { credentialTypeId: id } });
        await tx.credentialRequirement.createMany({
          data: dto.requirements.map((requirement) => ({
            credentialTypeId: id,
            jobRoleId: requirement.jobRoleId,
            required: requirement.required,
          })),
        });
      }
      return tx.credentialType.update({
        where: { id },
        data: {
          name,
          kind: dto.kind,
          ...(dto.renewalMonths === undefined ? {} : { renewalMonths: dto.renewalMonths }),
        },
        select: TYPE_SELECT,
      });
    });
  }

  /// No longer asked for. Anything recorded against it stays, and still
  /// counts down to its expiry; it just stops being expected of anybody.
  async archive(id: string) {
    const existing = await this.prisma.credentialType.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('That license type does not exist.');
    return this.prisma.credentialType.update({
      where: { id },
      data: { archivedAt: new Date() },
      select: TYPE_SELECT,
    });
  }

  /**
   * Each person against what their job roles ask for. Staff get their own;
   * managers everybody still employed, or one person.
   */
  standing(actor: AuthUser, employeeId?: string) {
    return this.standingOf(actor.role === Role.EMPLOYEE ? actor.id : employeeId);
  }

  private standingOf(only: string | undefined) {
    return loadStanding(this.prisma, only);
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.credentialType.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`There is already a license type called “${name}”.`);
  }

  private async assertRoles(requirements: { jobRoleId: string }[]) {
    const ids = [...new Set(requirements.map((requirement) => requirement.jobRoleId))];
    if (ids.length !== requirements.length) {
      throw new BadRequestException('Each job role can be listed once.');
    }
    if (ids.length === 0) return;
    const found = await this.prisma.jobRole.count({ where: { id: { in: ids } } });
    if (found !== ids.length)
      throw new BadRequestException('One of those job roles does not exist.');
  }
}
