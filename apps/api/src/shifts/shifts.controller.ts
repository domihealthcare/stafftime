import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Role, ShiftStatus } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CoverOptionsService } from './cover-options.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { OvertimeCheckDto } from './dto/overtime-check.dto';
import { QueryShiftsDto } from './dto/query-shifts.dto';
import {
  CopyWeekDto,
  PublishShiftsDto,
  QueryCoverageDto,
  RepeatShiftsDto,
  SetWeeklyScheduleDto,
  StopStandingShiftDto,
  SuggestCoverDto,
  UpdateStandingShiftDto,
} from './dto/repeat-shifts.dto';
import { RetimeShiftDto } from './dto/retime-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { OvertimeService } from './overtime.service';
import { ShiftPlanningService } from './shift-planning.service';
import { ShiftRetimeService } from './shift-retime.service';
import { ShiftsService } from './shifts.service';
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';

// A save here can change somebody's calendar invites.
@UseInterceptors(InvitesSyncInterceptor)
@Controller('shifts')
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly planning: ShiftPlanningService,
    private readonly overtime: OvertimeService,
    private readonly retiming: ShiftRetimeService,
    private readonly cover: CoverOptionsService,
  ) {}

  /// "Every Tuesday and Thursday, 9 to 5, until March" — or, with no last
  /// date, "every Monday" for good: a standing shift.
  @Post('repeat')
  @Roles(Role.MANAGER)
  repeat(@Body() dto: RepeatShiftsDto, @CurrentUser() user: AuthUser) {
    return this.planning.repeat(dto, user.id);
  }

  /// The standing shifts still running. Declared before `:id`, which would
  /// otherwise take "standing" for a shift id.
  @Get('standing')
  @Roles(Role.MANAGER)
  standing() {
    return this.planning.standing();
  }

  /// Changes a standing shift's days, hours or place from a given day on.
  @Post('standing/:id/update')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  updateStanding(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStandingShiftDto) {
    return this.planning.updateStanding(id, dto);
  }

  /// Ends a standing shift after a given day.
  @Post('standing/:id/stop')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  stopStanding(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StopStandingShiftDto) {
    return this.planning.stopStanding(id, dto);
  }

  /// Sets somebody's usual week — each day off, or hours and a place — as
  /// their regular shifts, from a given day on.
  @Post('weekly/:employeeId')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  setWeek(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SetWeeklyScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.planning.setWeek(employeeId, dto, user.id);
  }

  /// Copies one week's shifts onto another.
  @Post('copy-week')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  copyWeek(@Body() dto: CopyWeekDto, @CurrentUser() user: AuthUser) {
    return this.planning.copyWeek(dto, user.id);
  }

  /// Publishes several drafts at once. Each person is told once, however many
  /// of their shifts went out.
  @Post('publish')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  publish(@Body() dto: PublishShiftsDto) {
    return this.planning.publishMany(dto.ids);
  }

  /// A first draft for the open shifts on screen: somebody free for each,
  /// or nobody. Only reads — the manager keeps the ones they want.
  @Post('suggest-cover')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  suggestCover(@Body() dto: SuggestCoverDto) {
    return this.cover.suggestForOpen(dto.ids);
  }

  /// Day-by-day staffing, and the gaps.
  @Get('coverage')
  @Roles(Role.MANAGER)
  coverage(@Query() query: QueryCoverageDto) {
    return this.planning.coverage(query);
  }

  /// What one shift would do to somebody's week — asked before saving it, so
  /// the scheduler can warn first rather than after.
  @Get('overtime-check')
  @Roles(Role.MANAGER)
  overtimeCheck(@Query() query: OvertimeCheckDto) {
    return this.overtime.check({
      employeeId: query.employeeId,
      locationId: query.locationId,
      startsAt: new Date(query.startsAt),
      endsAt: new Date(query.endsAt),
      shiftId: query.shiftId,
    });
  }

  /// Your own coming weeks that your published rota puts over, or close to,
  /// the overtime line. Anyone signed in, about themselves only.
  @Get('my-overtime')
  myOvertime(@CurrentUser() user: AuthUser) {
    return this.overtime.mine(user.id);
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.shifts.create(dto, user.id);
  }

  /// Managers see the whole schedule; employees only ever see their own
  /// shifts, and never a draft — a shift reaches them when it is published.
  @Get()
  findAll(@Query() query: QueryShiftsDto, @CurrentUser() user: AuthUser) {
    if (user.role === Role.EMPLOYEE) {
      return this.shifts.findAll({ ...query, employeeId: user.id }, { withoutDrafts: true });
    }
    return this.shifts.findAll(query);
  }

  /// Staff may read their own published (or cancelled) shifts only, as with
  /// the list above; to anybody else's, or a draft, the answer is the same as
  /// for one that does not exist.
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const shift = await this.shifts.findOne(id);
    if (
      user.role === Role.EMPLOYEE &&
      (shift.employeeId !== user.id || shift.status === ShiftStatus.DRAFT)
    ) {
      throw new NotFoundException(`Shift ${id} not found`);
    }
    return shift;
  }

  /// Who could work this shift, best first, and why — for putting somebody in
  /// an open shift or replacing whoever is on it.
  @Get(':id/cover-options')
  @Roles(Role.MANAGER)
  coverOptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.cover.forShift(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.update(id, dto);
  }

  /// New hours for a shift — this one, the same weekday from here on, or
  /// every later shift of theirs at those hours.
  @Post(':id/retime')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  retime(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RetimeShiftDto) {
    return this.retiming.retime(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.remove(id);
  }
}
