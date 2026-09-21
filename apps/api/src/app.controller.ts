import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @Public()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'stafftime-api', timestamp: new Date().toISOString() };
  }
}
