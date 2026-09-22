import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ChecklistKind, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistsService } from './checklists.service';
import {
  CreateTemplateDto,
  QueryChecklistsDto,
  StartChecklistDto,
  UpdateTaskDto,
  UpdateTemplateDto,
} from './dto/checklist.dto';

@Controller('checklists')
export class ChecklistsController {
  constructor(
    private readonly checklists: ChecklistsService,
    private readonly templates: ChecklistTemplatesService,
  ) {}

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  /// Managers read templates so they can see what a checklist will contain;
  /// only an admin changes them.
  @Get('templates')
  @Roles(Role.MANAGER)
  listTemplates(
    @Query('kind') kind?: ChecklistKind,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.templates.findAll(kind, includeArchived === 'true');
  }

  @Get('templates/:id')
  @Roles(Role.MANAGER)
  getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.findOne(id);
  }

  @Post('templates')
  @Roles(Role.ADMIN)
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: AuthUser) {
    return this.templates.create(dto, user.id);
  }

  @Patch('templates/:id')
  @Roles(Role.ADMIN)
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(id, dto);
  }

  /// Retired, not deleted, so a finished checklist can still say where it came from.
  @Delete('templates/:id')
  @Roles(Role.ADMIN)
  archiveTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.archive(id);
  }

  @Post('templates/:id/restore')
  @Roles(Role.ADMIN)
  restoreTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.restore(id);
  }

  // -------------------------------------------------------------------------
  // Checklists
  // -------------------------------------------------------------------------

  /// Employees see their own and nothing else — enforced in the service, not here.
  @Get()
  list(@Query() query: QueryChecklistsDto, @CurrentUser() user: AuthUser) {
    return this.checklists.findAll(query, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.checklists.findOne(id, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  start(@Body() dto: StartChecklistDto, @CurrentUser() user: AuthUser) {
    return this.checklists.start(dto, user);
  }

  /// Admin-only: a completed checklist is a record of what was done and when.
  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklists.remove(id);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklists.updateTask(taskId, dto, user);
  }
}
