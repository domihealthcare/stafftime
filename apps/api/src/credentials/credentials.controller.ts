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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { UploadedFileLike } from '../storage/upload-validation';
import { attachmentHeader } from '../storage/upload-validation';
import { CredentialsService } from './credentials.service';
import {
  CreateCredentialDto,
  QueryCredentialsDto,
  UpdateCredentialDto,
} from './dto/credential.dto';

/// A hard ceiling on what multer will buffer. The configured limit
/// (MAX_UPLOAD_MB) is enforced in the service; this only stops an enormous POST
/// reaching memory, because the interceptor's options are fixed before config
/// is available.
const HARD_UPLOAD_CEILING_BYTES = 50 * 1024 * 1024;

@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  /// What is about to lapse. The question a practice manager actually asks, and
  /// what the nightly job sends out.
  @Get('expiring')
  @Roles(Role.MANAGER)
  expiring(@Query('withinDays') withinDays?: string) {
    return this.credentials.expiring(withinDays ? Number(withinDays) : undefined);
  }

  /// Employees see their own and nothing else — enforced in the service.
  @Get()
  list(@Query() query: QueryCredentialsDto, @CurrentUser() user: AuthUser) {
    return this.credentials.findAll(query, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.credentials.findOne(id, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateCredentialDto, @CurrentUser() user: AuthUser) {
    return this.credentials.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCredentialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.credentials.update(id, dto, user);
  }

  /// Superseded by a renewal. Kept, unlike a delete.
  @Post(':id/archive')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.credentials.archive(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.credentials.remove(id, user);
  }

  @Post(':id/scan')
  @Roles(Role.MANAGER)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: HARD_UPLOAD_CEILING_BYTES, files: 1 },
    }),
  )
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.credentials.attach(id, file, user);
  }

  /// The scan itself, which is narrower than the record: a licence document
  /// carries a number, a signature and sometimes a home address.
  @Get(':id/scan')
  async scan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const file = await this.credentials.downloadScan(id, user);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', attachmentHeader(file.filename));
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.bytes);
  }
}
