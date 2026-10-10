import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsUUID } from 'class-validator';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';
import { CoverRequestsService } from './cover-requests.service';

export class AskCoverDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  employeeIds!: string[];
}

export class CoverAnswerDto {
  @IsBoolean()
  yes!: boolean;
}

/// "Ask who can cover" (October 2026): managers ask about an open shift;
/// the people asked — and only they — see it and answer.
@Controller()
export class CoverRequestsController {
  constructor(private readonly cover: CoverRequestsService) {}

  @Post('shifts/:id/ask-cover')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  ask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AskCoverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cover.ask(id, dto.employeeIds, user);
  }

  @Get('shifts/:id/cover-request')
  @Roles(Role.MANAGER)
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.cover.status(id);
  }

  @Post('shifts/:id/cover-request/stop')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  stop(@Param('id', ParseUUIDPipe) id: string) {
    return this.cover.stop(id);
  }

  @Get('cover/:id')
  view(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.cover.view(id, user);
  }

  /// A yes puts somebody on a shift, so their calendar invites follow.
  @Post('cover/:id/answer')
  @UseInterceptors(InvitesSyncInterceptor)
  @HttpCode(HttpStatus.OK)
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CoverAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cover.answer(id, dto.yes, user);
  }
}
