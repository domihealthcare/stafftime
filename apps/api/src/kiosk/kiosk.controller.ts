import {
  BadRequestException,
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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationKind, Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CreateKioskDto, KioskPunchDto, PairKioskDto, SetKioskPinDto } from './dto/kiosk.dto';
import { secureCookies } from '../auth/cookie';
import { KIOSK_COOKIE, clearKioskCookie, kioskCookieOptions } from './kiosk-cookie';
import { KioskDeviceGuard } from './kiosk.guard';
import { KioskPunchService } from './kiosk-punch.service';
import { KioskService } from './kiosk.service';
import { PinService } from './pin.service';
import { DowntimeService } from '../downtime/downtime.service';
import { InboxService } from '../email/inbox.service';

/**
 * Two audiences in one controller, kept apart by their guards:
 *
 *  - the tablet itself, authenticated by device cookie (@UseGuards(KioskDeviceGuard)
 *    on a @Public() route, so the normal user-session guard stands aside)
 *  - administrators managing kiosks from the web app, on the usual session guard
 */
@Controller('kiosk')
export class KioskController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly kiosks: KioskService,
    private readonly punches: KioskPunchService,
    private readonly pins: PinService,
    private readonly downtimes: DowntimeService,
    private readonly inbox: InboxService,
    config: ConfigService,
  ) {
    this.secureCookies = secureCookies(config);
  }

  // ---------------------------------------------------------------- the tablet

  /// Exchanges a pairing code for a device cookie. Open by necessity: the
  /// tablet has no credentials yet, and the code itself is the credential.
  @Post('pair')
  @Public()
  @HttpCode(HttpStatus.OK)
  async pair(@Body() dto: PairKioskDto, @Res({ passthrough: true }) response: Response) {
    const { token, device } = await this.kiosks.pair(dto.pairingCode);
    response.cookie(KIOSK_COOKIE, token, kioskCookieOptions(this.secureCookies));
    return {
      deviceName: device.deviceName,
      locationId: device.locationId,
      locationName: device.locationName,
    };
  }

  /// What this tablet is bound to. The kiosk app calls it on load to decide
  /// between the pairing screen and the keypad.
  @Get('session')
  @Public()
  @UseGuards(KioskDeviceGuard)
  session(@Req() request: Request) {
    const kiosk = request.kiosk!;
    return {
      deviceName: kiosk.deviceName,
      locationId: kiosk.locationId,
      locationName: kiosk.locationName,
    };
  }

  /// Staff this kiosk may sign in - scoped to its own location, so a tablet
  /// cannot be used to read the whole practice roster.
  @Get('employees')
  @Public()
  @UseGuards(KioskDeviceGuard)
  employees(@Req() request: Request) {
    return this.kiosks.listEligibleEmployees(request.kiosk!.locationId);
  }

  /// News posts chosen for the time clock (Dominguez, October 2026): what
  /// its main screen shows above the "Clock in or out" button.
  @Get('posts')
  @Public()
  @UseGuards(KioskDeviceGuard)
  posts() {
    return this.kiosks.timeClockPosts();
  }

  /// A downtime on now at this time clock's office (October 2026): shown on
  /// its main screen, so staff arriving see it before they clock in.
  @Get('downtime')
  @Public()
  @UseGuards(KioskDeviceGuard)
  downtime(@Req() request: Request) {
    return this.downtimes.activeAt(request.kiosk!.locationId);
  }

  @Post('punch')
  @Public()
  @UseGuards(KioskDeviceGuard)
  @HttpCode(HttpStatus.OK)
  punch(@Body() dto: KioskPunchDto, @Req() request: Request) {
    return this.punches.punch(request.kiosk!, dto.employeeId, dto.pin, dto.closing);
  }

  /// Unpairs this tablet - for a device being retired or handed on.
  @Post('unpair')
  @Public()
  @UseGuards(KioskDeviceGuard)
  @HttpCode(HttpStatus.OK)
  async unpair(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.kiosks.revoke(request.kiosk!.deviceId);
    clearKioskCookie(response, this.secureCookies);
    return { unpaired: true };
  }

  // --------------------------------------------------------------- the admin

  @Post('devices')
  @Roles(Role.ADMIN)
  createDevice(@Body() dto: CreateKioskDto, @CurrentUser() user: AuthUser) {
    return this.kiosks.createDevice({ ...dto, createdById: user.id });
  }

  @Get('devices')
  @Roles(Role.ADMIN)
  listDevices() {
    return this.kiosks.listDevices();
  }

  @Post('devices/:id/pairing-code')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  regenerate(@Param('id', ParseUUIDPipe) id: string) {
    return this.kiosks.regeneratePairingCode(id);
  }

  @Delete('devices/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    await this.kiosks.revoke(id);
    return { revoked: true };
  }

  /// Admins only (October 2026). Staff choose their own PIN on Your profile;
  /// an admin sets a replacement from the Staff editor or Kiosks, never reads
  /// one. Managers could too until the maintenance pass of 29 October 2026:
  /// the same PIN unlocks the pay screens, so a manager able to set an
  /// admin's PIN could open pay on a computer where that admin was still
  /// signed in. The screens were already admins' only.
  @Put('employees/:id/pin')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async setPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetKioskPinDto,
    @CurrentUser() user: AuthUser,
  ) {
    const verdict = this.pins.check(dto.pin);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    await this.punches.setPin(id, dto.pin);
    await this.tellOfPinChange(id, user, 'Your tablet PIN was changed for you');
    return { set: true };
  }

  @Delete('employees/:id/pin')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async clearPin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.punches.clearPin(id);
    await this.tellOfPinChange(id, user, 'Your tablet PIN was removed');
    return { cleared: true };
  }

  /// The person hears when somebody else sets or removes their PIN, since it
  /// also unlocks pay. The bell's "profile" kind: it is about Your profile.
  private async tellOfPinChange(employeeId: string, actor: AuthUser, title: string) {
    if (employeeId === actor.id) return;
    await this.inbox.notify([employeeId], {
      kind: NotificationKind.PROFILE_PHOTO,
      title,
      body: 'An admin did this. If you did not ask for it, tell a manager. You can choose a new PIN on Your profile.',
      link: '/profile',
    });
  }
}
