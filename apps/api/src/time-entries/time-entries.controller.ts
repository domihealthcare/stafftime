import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClockMethod, Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { EditTimeEntryDto } from './dto/edit-time-entry.dto';
import { QueryTimeEntriesDto } from './dto/query-time-entries.dto';
import { TimeEntriesService } from './time-entries.service';

@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntries: TimeEntriesService) {}

  @Post('clock-in')
  clockIn(@Body() dto: ClockInDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    // A kiosk punch skips the location check, because the time clock is bound
    // to its office. It must therefore only ever come from the time clock
    // itself (KioskPunchService calls the service directly) — never from this
    // route, where anybody signed in could claim to be one, from anywhere and
    // on anybody's behalf. Found in the September 2026 review.
    if (dto.method === ClockMethod.KIOSK) {
      throw new ForbiddenException('Time clock punches can only be made at the time clock.');
    }
    return this.timeEntries.clockIn(dto, user, ip);
  }

  @Post('clock-out')
  clockOut(
    @Body() dto: ClockOutDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.timeEntries.clockOut(dto, user, ip, employeeId);
  }

  /// The caller's open punch, if any.
  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.timeEntries.findCurrent(user.id);
  }

  /// Managers see everyone's timesheet; employees only their own.
  @Get()
  findAll(@Query() query: QueryTimeEntriesDto, @CurrentUser() user: AuthUser) {
    const scoped: QueryTimeEntriesDto =
      user.role === Role.EMPLOYEE ? { ...query, employeeId: user.id } : query;
    return this.timeEntries.findAll(scoped);
  }

  /// Staff may read their own punches only; to anybody else's the answer is
  /// the same as for one that does not exist.
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const entry = await this.timeEntries.findOne(id);
    if (user.role === Role.EMPLOYEE && entry.employeeId !== user.id) {
      throw new NotFoundException(`Time entry ${id} not found`);
    }
    return entry;
  }

  /// Where a punch was made from. The only route that returns coordinates, and
  /// the read is written to the log — see `TimeEntriesService.locationTrail`.
  @Get(':id/location')
  @Roles(Role.ADMIN)
  locationTrail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.timeEntries.locationTrail(id, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditTimeEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.timeEntries.edit(id, dto, user);
  }

  @Patch(':id/approve')
  @Roles(Role.MANAGER)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.timeEntries.approve(id, user);
  }
}
