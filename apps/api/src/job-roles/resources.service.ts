import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResourceKind, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { JobRolesService } from './job-roles.service';

const RESOURCE_SELECT = {
  id: true,
  jobRoleId: true,
  kind: true,
  title: true,
  url: true,
  body: true,
  sortOrder: true,
  updatedAt: true,
} satisfies Prisma.ResourceSelect;

/**
 * Links and short written pages, filed by job role.
 *
 * Never files: nothing is uploaded to this app. A document stays where the
 * practice keeps it, and a resource points there.
 */
@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRoles: JobRolesService,
  ) {}

  /**
   * One section for everybody, then one per job role.
   *
   * Staff see the everybody section and their own roles. Managers see every
   * role, including empty ones, because they are the ones filling them — with
   * their own marked, so they can still see what their staff see.
   */
  async sections(actor: AuthUser) {
    const isManager = actor.role !== Role.EMPLOYEE;
    const mine = await this.jobRoles.idsFor(actor.id);

    const roles = await this.prisma.jobRole.findMany({
      where: isManager ? {} : { id: { in: mine } },
      select: { id: true, name: true, description: true, colour: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const resources = await this.prisma.resource.findMany({
      where: {
        OR: [{ jobRoleId: null }, { jobRoleId: { in: roles.map((role) => role.id) } }],
      },
      select: RESOURCE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    const forRole = (id: string | null) => resources.filter((row) => row.jobRoleId === id);

    return {
      sections: [
        { jobRole: null, yours: true, resources: forRole(null) },
        ...roles.map((role) => ({
          jobRole: role,
          yours: mine.includes(role.id),
          resources: forRole(role.id),
        })),
      ],
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const row = await this.prisma.resource.findUnique({
      where: { id },
      select: { ...RESOURCE_SELECT, jobRole: { select: { id: true, name: true, colour: true } } },
    });
    if (!row) throw new NotFoundException('That resource does not exist.');

    if (actor.role === Role.EMPLOYEE && row.jobRoleId !== null) {
      const mine = await this.jobRoles.idsFor(actor.id);
      if (!mine.includes(row.jobRoleId)) {
        throw new ForbiddenException('That is for a job role you are not in.');
      }
    }
    return row;
  }

  async create(dto: CreateResourceDto, actor: AuthUser) {
    const jobRoleId = dto.jobRoleId ?? null;
    if (jobRoleId) await this.jobRoles.findOne(jobRoleId);
    const content = checkContent(dto.kind, dto.url, dto.body);

    const last = await this.prisma.resource.aggregate({
      where: { jobRoleId },
      _max: { sortOrder: true },
    });

    const row = await this.prisma.resource.create({
      data: {
        jobRoleId,
        kind: dto.kind,
        title: dto.title.trim(),
        ...content,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
        createdById: actor.id,
      },
      select: RESOURCE_SELECT,
    });
    this.logger.log(`Resource ${row.id} (${row.kind}) added by ${actor.id}`);
    return row;
  }

  async update(id: string, dto: UpdateResourceDto, actor: AuthUser) {
    const existing = await this.findOne(id, actor);
    if (dto.jobRoleId) await this.jobRoles.findOne(dto.jobRoleId);

    const content =
      dto.url === undefined && dto.body === undefined
        ? {}
        : checkContent(
            existing.kind,
            dto.url === undefined ? (existing.url ?? undefined) : dto.url,
            dto.body === undefined ? (existing.body ?? undefined) : dto.body,
          );

    const row = await this.prisma.resource.update({
      where: { id },
      data: {
        jobRoleId: dto.jobRoleId,
        title: dto.title?.trim(),
        sortOrder: dto.sortOrder,
        ...content,
      },
      select: RESOURCE_SELECT,
    });
    this.logger.log(`Resource ${id} updated by ${actor.id}`);
    return row;
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    await this.prisma.resource.delete({ where: { id } });
    this.logger.log(`Resource ${id} deleted by ${actor.id}`);
    return { deleted: true };
  }
}

/// A link needs somewhere to go; a page needs something written on it.
export function checkContent(kind: ResourceKind, url?: string, body?: string) {
  const text = body?.trim() || null;

  if (kind === ResourceKind.PAGE) {
    if (!text) throw new BadRequestException('A page needs something written on it.');
    return { url: null, body: text };
  }

  return { url: safeLink(url), body: text };
}

/**
 * Only web addresses. A `javascript:` link is the obvious way to turn a
 * harmless-looking resource into something that runs in a colleague's session,
 * and there is no resource anybody needs that is not http or https.
 */
export function safeLink(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new BadRequestException('A link needs an address.');

  // "drive.google.com/…" is what people paste; it means https.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new BadRequestException('That does not look like a web address.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('Links have to be web addresses, starting https://.');
  }
  if (!parsed.hostname.includes('.')) {
    throw new BadRequestException('That does not look like a web address.');
  }
  return parsed.href;
}
