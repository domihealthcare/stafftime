import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { DigestTopic, EmploymentStatus, Prisma, Role } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { UpdatePreferencesDto } from '../auth/dto/preferences.dto';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { uncoveredTopics } from './digest-topics';

const MANAGERS = {
  role: { in: [Role.MANAGER, Role.ADMIN] },
  employmentStatus: EmploymentStatus.ACTIVE,
};

/// The job roles whose people may be chosen to be told of a part, whatever
/// their access (October 2026, Dominguez: "administrative roles should be an
/// option to chose so they can possibly be notified"). Being told is all it
/// gives them: deciding still needs Manager access.
export const ADMIN_TEAM_ROLES = ['Administrative', 'Manager'];

/// Who may be chosen to look after a part: managers and admins, and the
/// admin team by job role. Never a shared account.
export const ASSIGNABLE: Prisma.EmployeeWhereInput = {
  employmentStatus: EmploymentStatus.ACTIVE,
  isSharedAccount: false,
  OR: [
    { role: { in: [Role.MANAGER, Role.ADMIN] } },
    {
      jobRoles: {
        some: { jobRole: { name: { in: ADMIN_TEAM_ROLES, mode: 'insensitive' } } },
      },
    },
  ],
};

/// The people chosen to look after one part, saved whole.
export class TopicAssigneesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  employeeIds!: string[];
}

const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  wantsDailyDigest: true,
  mutedDigestTopics: true,
} as const;

/**
 * Who gets which part of the nightly round-up, for the whole practice - the
 * table on Email settings (October 2026, Dominguez: "certain managers should
 * be notified of certain things").
 *
 * Managers read it, so they can see who else looks after something before
 * leaving it out. Admins change it for anybody; everybody else changes only
 * their own, through `PATCH /auth/preferences`.
 *
 * **Who looks after what** (October 2026): beside the unticking, a part can
 * have people *chosen* for it (`TopicAssignee`) - set by managers on the
 * screen the part belongs to (Time off requests, Closing checklists). A part
 * with anybody chosen goes to them alone, bell and round-up; with nobody, the
 * ticks decide as before.
 */
@Controller('digest-settings')
export class DigestSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.MANAGER)
  async list() {
    const people = await this.prisma.employee.findMany({
      where: MANAGERS,
      select: SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    // Among those who get the round-up at all: somebody who has turned it off
    // is not covering anything, whatever they have ticked.
    const uncovered = uncoveredTopics(people.filter((person) => person.wantsDailyDigest));
    return { people, uncovered };
  }

  /// Who is chosen for each part: `{ TIME_OFF: [ids], CLOSING: [ids], ... }`.
  @Get('assignees')
  @Roles(Role.MANAGER)
  async assignees() {
    const rows = await this.prisma.topicAssignee.findMany({
      where: { employee: ASSIGNABLE },
      select: { topic: true, employeeId: true },
    });
    // Every part is filled in just below, so every key is there.
    const byTopic = {} as Record<DigestTopic, string[]>;
    for (const topic of Object.values(DigestTopic)) byTopic[topic] = [];
    for (const row of rows) byTopic[row.topic].push(row.employeeId);
    return byTopic;
  }

  /// Replaces who is chosen for one part. Only managers and admins still here,
  /// and the admin team by job role, can be chosen; anybody else sent is left
  /// off.
  @Put('assignees/:topic')
  @Roles(Role.MANAGER)
  async setAssignees(@Param('topic') topicName: string, @Body() dto: TopicAssigneesDto) {
    const topic = (Object.values(DigestTopic) as string[]).includes(topicName)
      ? (topicName as DigestTopic)
      : null;
    if (!topic) throw new BadRequestException('That is not a part of the round-up.');
    const people = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(dto.employeeIds)] }, ...ASSIGNABLE },
      select: { id: true },
    });
    const ids = people.map((person) => person.id);
    await this.prisma.$transaction([
      this.prisma.topicAssignee.deleteMany({ where: { topic, employeeId: { notIn: ids } } }),
      ...ids.map((employeeId) =>
        this.prisma.topicAssignee.upsert({
          where: { topic_employeeId: { topic, employeeId } },
          create: { topic, employeeId },
          update: {},
        }),
      ),
    ]);
    return { topic, employeeIds: ids };
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePreferencesDto) {
    // Only managers and admins are ever sent it; anybody else is not on the table.
    const found = await this.prisma.employee.findFirst({ where: { id, ...MANAGERS } });
    if (!found) throw new NotFoundException('No manager or admin with that id.');
    return this.prisma.employee.update({
      where: { id },
      data: { wantsDailyDigest: dto.wantsDailyDigest, mutedDigestTopics: dto.mutedDigestTopics },
      select: SELECT,
    });
  }
}
