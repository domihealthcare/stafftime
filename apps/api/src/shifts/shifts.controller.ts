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
import { CreateShiftDto } from './dto/create-shift.dto';
import { QueryShiftsDto } from './dto/query-shifts.dto';
import { CopyWeekDto, QueryCoverageDto, RepeatShiftsDto } from './dto/repeat-shifts.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftPlanningService } from './shift-planning.service';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly planning: ShiftPlanningService,
  ) {}

  /// "Every Tuesday and Thursday, 9 to 5, until March."
  @Post('repeat')
  @Roles(Role.MANAGER)
  repeat(@Body() dto: RepeatShiftsDto, @CurrentUser() user: AuthUser) {
    return this.planning.repeat(dto, user.id);
  }

  /// Copies one week's shifts onto another.
  @Post('copy-week')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  copyWeek(@Body() dto: CopyWeekDto, @CurrentUser() user: AuthUser) {
    return this.planning.copyWeek(dto, user.id);
  }

  /// Day-by-day staffing, and the gaps.
  @Get('coverage')
  @Roles(Role.MANAGER)
  coverage(@Query() query: QueryCoverageDto) {
    return this.planning.coverage(query);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.shifts.create(dto, user.id);
  }

  /// Managers see the whole schedule; employees only ever see their own shifts.
  @Get()
  findAll(@Query() query: QueryShiftsDto, @CurrentUser() user: AuthUser) {
    const scoped: QueryShiftsDto =
      user.role === Role.EMPLOYEE ? { ...query, employeeId: user.id } : query;
    return this.shifts.findAll(scoped);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.remove(id);
  }
}
