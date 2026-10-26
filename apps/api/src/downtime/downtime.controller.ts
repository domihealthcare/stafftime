import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DowntimeService } from './downtime.service';
import {
  CatchUpInput,
  ContactTickInput,
  DowntimeCheckInput,
  DowntimeContactsInput,
  DowntimeUpdateInput,
  EndDowntimeInput,
  KitItemsInput,
  PadProvidersInput,
  StartDowntimeInput,
} from './dto/downtime.dto';

/// Downtime: everybody signed in reads what is going on and the set-up the
/// forms need; managers and admins start, update and close one, and keep the
/// log and the set-up. The monthly check is the admin team's.
@Controller('downtime')
export class DowntimeController {
  constructor(private readonly downtime: DowntimeService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.downtime.current(user);
  }

  @Get('log')
  @Roles(Role.MANAGER)
  log(@Query('year') year: string | undefined, @CurrentUser() user: AuthUser) {
    return this.downtime.log(user, year ? Number(year) : undefined);
  }

  @Post()
  @Roles(Role.MANAGER)
  start(@Body() dto: StartDowntimeInput, @CurrentUser() user: AuthUser) {
    return this.downtime.start(dto, user);
  }

  @Post(':id/updates')
  @Roles(Role.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DowntimeUpdateInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtime.postUpdate(id, dto.body, user);
  }

  @Put(':id/contacts/:contactId')
  @Roles(Role.MANAGER)
  tick(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: ContactTickInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtime.tickContact(id, contactId, dto.done, user);
  }

  @Post(':id/end')
  @Roles(Role.MANAGER)
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EndDowntimeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtime.end(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.downtime.cancel(id, user);
  }

  @Put(':id/catch-up')
  @Roles(Role.MANAGER)
  catchUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CatchUpInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtime.setCatchUp(id, dto, user);
  }

  @Put(':id/caught-up')
  @Roles(Role.MANAGER)
  caughtUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactTickInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtime.markCaughtUp(id, dto.done, user);
  }

  @Put(':id/shredded')
  @Roles(Role.MANAGER)
  shredded(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactTickInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtime.markShredded(id, dto.done, user);
  }

  // The set-up. Contacts are the managers'; the kit list and the providers
  // on the pads are read by anybody printing or doing the check.

  @Get('setup/contacts')
  @Roles(Role.MANAGER)
  contacts() {
    return this.downtime.contacts();
  }

  @Put('setup/contacts')
  @Roles(Role.MANAGER)
  saveContacts(@Body() dto: DowntimeContactsInput) {
    return this.downtime.saveContacts(dto);
  }

  @Get('setup/kit')
  kit() {
    return this.downtime.kitItems();
  }

  @Put('setup/kit')
  @Roles(Role.MANAGER)
  saveKit(@Body() dto: KitItemsInput) {
    return this.downtime.saveKitItems(dto);
  }

  @Get('setup/pad-providers')
  padProviders() {
    return this.downtime.padProviders();
  }

  @Put('setup/pad-providers')
  @Roles(Role.MANAGER)
  savePadProviders(@Body() dto: PadProvidersInput) {
    return this.downtime.savePadProviders(dto);
  }

  // The monthly check.

  @Get('check/mine')
  myCheck(@CurrentUser() user: AuthUser) {
    return this.downtime.myCheck(user);
  }

  @Post('check')
  submitCheck(@Body() dto: DowntimeCheckInput, @CurrentUser() user: AuthUser) {
    return this.downtime.submitCheck(dto, user);
  }

  @Get('checks')
  @Roles(Role.MANAGER)
  checks() {
    return this.downtime.checks();
  }

  @Put('checks/:id/read')
  @Roles(Role.MANAGER)
  readCheck(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.downtime.markCheckRead(id, user);
  }
}
