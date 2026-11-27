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
import {
  NewSecretSantaInput,
  SecretSantaInput,
  SecretSantaPeopleInput,
  SecretSantaWishesInput,
} from './dto/secret-santa.dto';
import { SecretSantaService } from './secret-santa.service';

/// Secret Santa (November 2026). Managers and admins set one up and draw the
/// names; everybody signs up (where allowed), writes gift ideas and sees who
/// they drew - and only that.
@Controller('secret-santa')
export class SecretSantaController {
  constructor(private readonly santas: SecretSantaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.santas.list(user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.santas.findOne(id, user);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: NewSecretSantaInput, @CurrentUser() user: AuthUser) {
    return this.santas.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SecretSantaInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.santas.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.santas.remove(id, user);
  }

  @Post(':id/people')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  addPeople(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SecretSantaPeopleInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.santas.addPeople(id, dto, user);
  }

  @Delete(':id/people/:employeeId')
  @Roles(Role.MANAGER)
  removePerson(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.santas.removePerson(id, employeeId, user);
  }

  @Post(':id/draw')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  draw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.santas.draw(id, user);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  join(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.santas.join(id, user);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  leave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.santas.leave(id, user);
  }

  @Put(':id/wishes')
  wishes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SecretSantaWishesInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.santas.setWishes(id, dto.wishes, user);
  }

  @Post(':id/email-me')
  @HttpCode(HttpStatus.OK)
  emailMe(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.santas.emailMe(id, user);
  }
}
