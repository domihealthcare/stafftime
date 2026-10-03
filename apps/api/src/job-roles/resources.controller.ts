import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { attachmentHeader, inlineHeader } from '../storage/download-headers';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { ResourcesService } from './resources.service';

/// Staff read what is for them; managers keep all of it.
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  sections(@CurrentUser() user: AuthUser) {
    return this.resources.sections(user);
  }

  /// What is in the Drive folder a link points at, or a folder inside it.
  @Get(':id/files')
  files(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('folder') folder?: string,
  ) {
    return this.resources.driveFiles(id, user, folder);
  }

  /**
   * One file from that folder, opened in a new tab: a PDF, picture or text
   * is shown, anything else saved. Handed on from Drive as it arrives, so
   * nothing is held here.
   *
   * A refusal is plain words, not JSON, because a person reads it in the tab.
   * The file's name may follow its id, only so the tab is titled with it.
   */
  @Get([':id/files/:fileId', ':id/files/:fileId/:name'])
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    let file;
    try {
      file = await this.resources.driveFile(id, fileId, user);
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      response.status(error.getStatus()).type('text/plain').send(error.message);
      return;
    }

    response
      .status(200)
      .setHeader('Content-Type', file.contentType)
      .setHeader('X-Content-Type-Options', 'nosniff')
      .setHeader(
        'Content-Disposition',
        file.inline ? inlineHeader(file.name) : attachmentHeader(file.name),
      )
      // Not kept by the browser either: it is the practice's file, in Drive.
      .setHeader('Cache-Control', 'private, no-store');
    try {
      await pipeline(Readable.fromWeb(file.body as NodeReadableStream<Uint8Array>), response);
    } catch (error) {
      // Google stopped part-way, or the person closed the tab.
      Logger.warn(
        `Drive file ${fileId} stopped part-way: ${error instanceof Error ? error.message : error}`,
        ResourcesController.name,
      );
      response.destroy();
    }
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.resources.findOne(id, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateResourceDto, @CurrentUser() user: AuthUser) {
    return this.resources.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resources.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.resources.remove(id, user);
  }
}
