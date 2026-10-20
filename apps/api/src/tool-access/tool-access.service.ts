import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { TOOLS, mayUse, type ToolSetting } from './tools';

/**
 * Who may use each built-in form and guide: read by the Resources page, the
 * session (so the screens know what to offer) and the guides, phone book and
 * diagnostics, which refuse anybody it leaves out. Managers and admins change
 * it, a tool at a time.
 */
@Injectable()
export class ToolAccessService {
  private readonly logger = new Logger(ToolAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Every tool's setting: what a manager chose, or its default.
  async settings(): Promise<ToolSetting[]> {
    const [rows, roles] = await Promise.all([
      this.prisma.toolAccess.findMany({
        select: { tool: true, everyone: true, roles: { select: { jobRoleId: true } } },
      }),
      this.prisma.jobRole.findMany({
        select: { id: true, name: true, usesClinicalForms: true, usesWellnessForm: true },
      }),
    ]);
    return TOOLS.map((tool) => {
      const row = rows.find((candidate) => candidate.tool === tool.key);
      if (row) {
        return {
          key: tool.key,
          everyone: row.everyone,
          jobRoleIds: row.roles.map((r) => r.jobRoleId),
        };
      }
      if (tool.defaults === 'everyone') return { key: tool.key, everyone: true, jobRoleIds: [] };
      const fits = tool.defaults;
      return {
        key: tool.key,
        everyone: false,
        jobRoleIds: roles.filter((role) => fits(role)).map((role) => role.id),
      };
    });
  }

  /// The tools somebody may open.
  async toolsFor(employeeId: string, role: Role): Promise<string[]> {
    const [settings, held] = await Promise.all([
      this.settings(),
      this.prisma.employeeJobRole.findMany({ where: { employeeId }, select: { jobRoleId: true } }),
    ]);
    const heldIds = held.map((row) => row.jobRoleId);
    return TOOLS.filter((tool) =>
      mayUse(
        tool,
        settings.find((s) => s.key === tool.key)!,
        role,
        heldIds,
      ),
    ).map((tool) => tool.key);
  }

  async assertCanUse(user: AuthUser, key: string, label: string) {
    const tools = await this.toolsFor(user.id, user.role);
    if (!tools.includes(key)) {
      throw new ForbiddenException(`The ${label} is not set up for your job role.`);
    }
  }

  async save(key: string, everyone: boolean, jobRoleIds: string[], actor: AuthUser) {
    if (!TOOLS.some((tool) => tool.key === key)) {
      throw new BadRequestException('There is no such form or guide.');
    }
    const ids = [...new Set(jobRoleIds)];
    const found = await this.prisma.jobRole.count({ where: { id: { in: ids } } });
    if (found !== ids.length)
      throw new BadRequestException('A job role chosen is no longer there.');
    await this.prisma.$transaction([
      this.prisma.toolAccess.upsert({
        where: { tool: key },
        create: { tool: key, everyone, updatedById: actor.id },
        update: { everyone, updatedById: actor.id },
      }),
      this.prisma.toolAccessRole.deleteMany({ where: { tool: key } }),
      this.prisma.toolAccessRole.createMany({
        data: ids.map((jobRoleId) => ({ tool: key, jobRoleId })),
      }),
    ]);
    this.logger.log(`Tool ${key}: access changed by ${actor.id}`);
    return this.settings();
  }
}
