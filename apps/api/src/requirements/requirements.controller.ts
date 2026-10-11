import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirementInput } from './dto/requirement.dto';
import { RequirementsService } from './requirements.service';

/// Required reading and tasks. Everybody reads and confirms their own;
/// managers and admins set them and see who has confirmed.
@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.requirements.mine(user);
  }

  @Post(':id/done')
  @HttpCode(HttpStatus.OK)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requirements.confirm(id, user);
  }

  @Get()
  @Roles(Role.MANAGER)
  list() {
    return this.requirements.list();
  }

  @Get(':id')
  @Roles(Role.MANAGER)
  progress(@Param('id', ParseUUIDPipe) id: string) {
    return this.requirements.progress(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: RequirementInput, @CurrentUser() user: AuthUser) {
    return this.requirements.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequirementInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requirements.update(id, dto, user);
  }

  @Post(':id/close')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requirements.setClosed(id, true, user);
  }

  @Post(':id/reopen')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requirements.setClosed(id, false, user);
  }

  @Post(':id/remind')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  remind(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requirements.remindNow(id, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requirements.remove(id, user);
  }
}
