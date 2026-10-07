import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { EmploymentStatus, Role } from '@prisma/client';
import { UpdatePreferencesDto } from '../auth/dto/preferences.dto';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { uncoveredTopics } from './digest-topics';

const MANAGERS = {
  role: { in: [Role.MANAGER, Role.ADMIN] },
  employmentStatus: EmploymentStatus.ACTIVE,
};

const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  wantsDailyDigest: true,
  mutedDigestTopics: true,
} as const;

/**
 * Who gets which part of the nightly round-up, for the whole practice — the
 * table on Email settings (October 2026, Dominguez: "certain managers should
 * be notified of certain things").
 *
 * Managers read it, so they can see who else looks after something before
 * leaving it out. Admins change it for anybody; everybody else changes only
 * their own, through `PATCH /auth/preferences`.
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
