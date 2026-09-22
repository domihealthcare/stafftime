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
import { CredentialsService } from './credentials.service';
import {
  CreateCredentialDto,
  QueryCredentialsDto,
  UpdateCredentialDto,
} from './dto/credential.dto';

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
}
