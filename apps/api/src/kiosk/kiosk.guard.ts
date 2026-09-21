import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { KIOSK_COOKIE } from './kiosk-cookie';
import { KioskService } from './kiosk.service';

/**
 * Authenticates the *device*, never a person.
 *
 * Deliberately separate from SessionAuthGuard: a kiosk token proves only "this
 * tablet is bound to North Bergen". It cannot read a timesheet, see the staff
 * list beyond that location, or act as anyone — each punch still needs a PIN.
 */
@Injectable()
export class KioskDeviceGuard implements CanActivate {
  constructor(private readonly kiosks: KioskService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[KIOSK_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException({
        message: 'This device is not set up as a kiosk yet.',
        code: 'KIOSK_NOT_PAIRED',
      });
    }

    const device = await this.kiosks.resolveDevice(token);
    if (!device) {
      throw new UnauthorizedException({
        message: 'This kiosk is no longer active. Ask an administrator to set it up again.',
        code: 'KIOSK_NOT_PAIRED',
      });
    }

    request.kiosk = device;
    return true;
  }
}
