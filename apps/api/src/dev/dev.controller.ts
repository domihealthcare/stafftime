import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/auth/public.decorator';
import { AuthMode } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Development-only helpers.
 *
 * With authentication stubbed there is no login screen, so the web app needs a
 * way to discover which employee ids it can act as. This controller provides
 * exactly that and nothing else.
 *
 * Every route 404s unless AUTH_MODE=dev, and env validation already refuses to
 * boot in that mode under NODE_ENV=production. The whole module should be
 * deleted when real login lands.
 */
@Controller('dev')
export class DevController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('employees')
  @Public()
  async listEmployees() {
    this.assertDevMode();

    return this.prisma.employee.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        employmentStatus: true,
      },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
    });
  }

  private assertDevMode() {
    if (this.config.get<AuthMode>('AUTH_MODE') !== AuthMode.Dev) {
      throw new NotFoundException();
    }
  }
}
