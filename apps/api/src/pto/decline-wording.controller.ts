import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AiService } from '../ai/ai.service';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { declineWording } from './decline-wording';

export class DeclineWordingDto {
  /// What the manager has typed so far; may be empty.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/// "Help me word it" on declining time off (AI). Saves nothing: the manager
/// reads it, edits it, and declines as usual.
@Controller('pto')
export class DeclineWordingController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':id/decline-wording')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async word(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineWordingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { reason: await declineWording(this.ai, this.prisma, id, user.id, dto.notes ?? '') };
  }
}
