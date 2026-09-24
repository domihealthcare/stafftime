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
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CreateKioskDto, KioskPunchDto, PairKioskDto, SetKioskPinDto } from './dto/kiosk.dto';
import { KIOSK_COOKIE, clearKioskCookie, kioskCookieOptions } from './kiosk-cookie';
import { KioskDeviceGuard } from './kiosk.guard';
import { KioskPunchService } from './kiosk-punch.service';
import { KioskService } from './kiosk.service';
import { PinService } from './pin.service';

/**
 * Two audiences in one controller, kept apart by their guards:
 *
 *  - the tablet itself, authenticated by device cookie (@UseGuards(KioskDeviceGuard)
 *    on a @Public() route, so the normal user-session guard stands aside)
 *  - administrators managing kiosks from the web app, on the usual session guard
 */
@Controller('kiosk')
export class KioskController {
  private readonly isProduction: boolean;

  constructor(
    private readonly kiosks: KioskService,
    private readonly punches: KioskPunchService,
    private readonly pins: PinService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  // ---------------------------------------------------------------- the tablet

  /// Exchanges a pairing code for a device cookie. Open by necessity: the
  /// tablet has no credentials yet, and the code itself is the credential.
  @Post('pair')
  @Public()
  @HttpCode(HttpStatus.OK)
  async pair(@Body() dto: PairKioskDto, @Res({ passthrough: true }) response: Response) {
    const { token, device } = await this.kiosks.pair(dto.pairingCode);
    response.cookie(KIOSK_COOKIE, token, kioskCookieOptions(this.isProduction));
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

  /// Staff this kiosk may sign in — scoped to its own location, so a tablet
  /// cannot be used to read the whole practice roster.
  @Get('employees')
  @Public()
  @UseGuards(KioskDeviceGuard)
  employees(@Req() request: Request) {
    return this.kiosks.listEligibleEmployees(request.kiosk!.locationId);
  }

  @Post('punch')
  @Public()
  @UseGuards(KioskDeviceGuard)
  @HttpCode(HttpStatus.OK)
  punch(@Body() dto: KioskPunchDto, @Req() request: Request) {
    return this.punches.punch(request.kiosk!, dto.employeeId, dto.pin, dto.closing);
  }

  /// Unpairs this tablet — for a device being retired or handed on.
  @Post('unpair')
  @Public()
  @UseGuards(KioskDeviceGuard)
  @HttpCode(HttpStatus.OK)
  async unpair(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.kiosks.revoke(request.kiosk!.deviceId);
    clearKioskCookie(response, this.isProduction);
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

  /// Managers too, not only admins: resetting a forgotten PIN is a front-desk
  /// job, and a manager is who somebody asks. They can set one, never read one.
  @Put('employees/:id/pin')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async setPin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetKioskPinDto) {
    const verdict = this.pins.check(dto.pin);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    await this.punches.setPin(id, dto.pin);
    return { set: true };
  }

  @Delete('employees/:id/pin')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  async clearPin(@Param('id', ParseUUIDPipe) id: string) {
    await this.punches.clearPin(id);
    return { cleared: true };
  }
}
