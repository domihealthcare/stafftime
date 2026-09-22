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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChecklistKind, Role } from '@prisma/client';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import {
  ChecklistDocumentsService,
  UploadedFileLike,
} from './checklist-documents.service';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistsService } from './checklists.service';
import {
  CreateTemplateDto,
  QueryChecklistsDto,
  StartChecklistDto,
  UpdateTaskDto,
  UpdateTemplateDto,
} from './dto/checklist.dto';

/// A hard ceiling on what multer will even buffer. The configured limit
/// (MAX_UPLOAD_MB) is enforced in the service; this is only here because the
/// interceptor's options are fixed when the class is defined, before config is
/// available, and something has to stop a 2GB POST before it reaches memory.
const HARD_UPLOAD_CEILING_BYTES = 50 * 1024 * 1024;

@Controller('checklists')
export class ChecklistsController {
  constructor(
    private readonly checklists: ChecklistsService,
    private readonly templates: ChecklistTemplatesService,
    private readonly documents: ChecklistDocumentsService,
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

  /// Admin-only, because this takes the attached documents with it.
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

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  @Post('tasks/:taskId/documents')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CEILING_BYTES, files: 1 } }),
  )
  upload(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.upload(taskId, file, user);
  }

  /// The only way the bytes ever leave the server. There is no public URL for a
  /// checklist document, by design — see src/storage/file-storage.ts.
  @Get('documents/:documentId')
  async download(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const file = await this.documents.download(documentId, user);

    res.setHeader('Content-Type', file.contentType);
    // Always an attachment, and never sniffed: whatever is in there, the
    // browser must not decide to run it in the app's own origin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', attachment(file.filename));
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.bytes);
  }

  @Delete('documents/:documentId')
  removeDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.remove(documentId, user);
  }
}

/// RFC 5987 encoding, so a filename with an accent or a comma in it survives
/// the header rather than truncating the download name.
function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
