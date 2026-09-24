import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ClosingService } from './closing.service';
import {
  ClosingDayQueryDto,
  CreateItemDto,
  CreateSectionDto,
  MoveDto,
  UpdateItemDto,
  UpdateSectionDto,
} from './dto/closing.dto';

/// Closing checklists. Anybody signed in reads their own for the punch they
/// are about to close; the records, the restock list and the editing are the
/// managers'.
@Controller('closing')
export class ClosingController {
  constructor(private readonly closing: ClosingService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.closing.forOpenPunch(user.id);
  }

  @Get('records')
  @Roles(Role.MANAGER)
  records(@Query() query: ClosingDayQueryDto) {
    return this.closing.day(query.date, query.locationId);
  }

  @Get('supplies')
  @Roles(Role.MANAGER)
  supplies() {
    return this.closing.supplies();
  }

  @Post('supplies/:id/ordered')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  ordered(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.closing.markOrdered(id, user.id);
  }

  @Get('templates')
  @Roles(Role.MANAGER)
  templates() {
    return this.closing.templates();
  }

  @Post('sections')
  @Roles(Role.MANAGER)
  createSection(@Body() dto: CreateSectionDto) {
    return this.closing.createSection(dto);
  }

  @Patch('sections/:id')
  @Roles(Role.MANAGER)
  updateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return this.closing.updateSection(id, dto);
  }

  @Delete('sections/:id')
  @Roles(Role.MANAGER)
  removeSection(@Param('id', ParseUUIDPipe) id: string) {
    return this.closing.removeSection(id);
  }

  @Post('sections/:id/move')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  moveSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    return this.closing.moveSection(id, dto.direction);
  }

  @Post('items')
  @Roles(Role.MANAGER)
  createItem(@Body() dto: CreateItemDto) {
    return this.closing.createItem(dto);
  }

  @Patch('items/:id')
  @Roles(Role.MANAGER)
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    return this.closing.updateItem(id, dto);
  }

  @Delete('items/:id')
  @Roles(Role.MANAGER)
  removeItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.closing.removeItem(id);
  }

  @Post('items/:id/move')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  moveItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    return this.closing.moveItem(id, dto.direction);
  }
}
