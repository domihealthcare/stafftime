import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Roles } from '../common/auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SetMinimumsDto } from './dto/minimums.dto';

/// The practice's minimum per office per job role (October 2026): see
/// `minimums.ts`. Managers keep it, beside the job roles themselves.
@Controller('staffing')
export class StaffingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('minimums')
  @Roles(Role.MANAGER)
  list() {
    return this.prisma.staffingMinimum.findMany({
      select: { locationId: true, jobRoleId: true, minimum: true, weekdays: true },
    });
  }

  @Put('minimums')
  @Roles(Role.MANAGER)
  async set(@Body() dto: SetMinimumsDto) {
    const keys = dto.minimums.map((row) => `${row.locationId}:${row.jobRoleId}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Each office and job role once.');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.staffingMinimum.deleteMany({}),
        this.prisma.staffingMinimum.createMany({
          // Each weekday once, in order; all seven is the same as every day.
          data: dto.minimums.map((row) => {
            const weekdays = [...new Set(row.weekdays ?? [])].sort((a, b) => a - b);
            return { ...row, weekdays: weekdays.length === 7 ? [] : weekdays };
          }),
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('That office or job role no longer exists.');
      }
      throw error;
    }
    return this.list();
  }
}
