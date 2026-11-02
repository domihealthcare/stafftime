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
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import {
  AdjustPtoBalanceDto,
  CreatePtoRequestDto,
  EditPtoRequestDto,
  PreviewPtoRequestDto,
  QueryPtoRequestsDto,
  RecordPtoDto,
  ReviewPtoRequestDto,
  UpdatePtoPolicyDto,
  TimeOffDaysQueryDto,
} from './dto/pto.dto';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';
import { CleanTimeOffService } from './clean-time-off.service';
import { PastBalanceRepairService } from './past-balance-repair.service';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

class SplitPastBalanceDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];
}

class ApproveCleanTimeOffDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';

@Controller('pto')
export class PtoController {
  constructor(
    private readonly pto: PtoService,
    private readonly policy: PtoPolicyService,
    private readonly cleanTimeOff: CleanTimeOffService,
    private readonly pastBalanceRepair: PastBalanceRepairService,
  ) {}

  /// The rules. Readable by everyone - staff should be able to see what they
  /// are entitled to without asking.
  @Get('policy')
  getPolicy() {
    return this.policy.get();
  }

  @Patch('policy')
  @Roles(Role.ADMIN)
  updatePolicy(@Body() dto: UpdatePtoPolicyDto, @CurrentUser() user: AuthUser) {
    return this.policy.update(dto, user.id);
  }

  /// Your own balance, or anyone's if you manage.
  @Get('balance')
  balance(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
  ) {
    const target = user.role === Role.EMPLOYEE || !employeeId ? user.id : employeeId;
    return this.policy.balanceFor(target, year ? Number(year) : undefined);
  }

  /// Everybody's balance this policy year, with what a manager has set.
  @Get('balances')
  @Roles(Role.MANAGER)
  staffBalances() {
    return this.policy.staffBalances();
  }

  /// One person's, for Adjust on their staff profile (October 2026).
  @Get('balances/:employeeId')
  @Roles(Role.MANAGER)
  staffBalance(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.policy.staffBalanceFor(employeeId);
  }

  /// Days already taken before Domi Staff, and a person's own allowance.
  @Put('balances/:employeeId')
  @Roles(Role.MANAGER)
  adjust(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: AdjustPtoBalanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.policy.adjust(employeeId, dto, user.id);
  }

  /// What a request would take and leave, before it is sent. Your own, or
  /// - for a manager filing for somebody - theirs.
  @Get('preview')
  preview(@Query() query: PreviewPtoRequestDto, @CurrentUser() user: AuthUser) {
    return this.pto.preview(query, user);
  }

  /// Anyone can ask for time off.
  @Post()
  create(@Body() dto: CreatePtoRequestDto, @CurrentUser() user: AuthUser) {
    return this.pto.create(dto, user);
  }

  /// Time off already taken, written down on a staff profile. Admins only,
  /// like the profile itself.
  @Post('record')
  @Roles(Role.ADMIN)
  record(@Body() dto: RecordPtoDto, @CurrentUser() user: AuthUser) {
    return this.pto.record(dto, user);
  }

  @Delete(':id/recorded')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  removeRecorded(@Param('id', ParseUUIDPipe) id: string) {
    return this.pto.removeRecorded(id);
  }

  /// Managers see everyone's; employees are scoped to their own.
  @Get()
  findAll(@Query() query: QueryPtoRequestsDto, @CurrentUser() user: AuthUser) {
    return this.pto.findAll(query, user);
  }

  /// Drives the badge on the Schedule tab.
  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.pto.pendingCount(user);
  }

  /// Which waiting requests are clean - enough left, nobody too thin, no
  /// shifts - for "Approve the clean ones" (`clean-time-off.ts`).
  @Get('clean')
  @Roles(Role.MANAGER)
  clean(@CurrentUser() user: AuthUser) {
    return this.cleanTimeOff.check(user);
  }

  /// Approves those still clean, each through the ordinary review.
  @Post('approve-clean')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  approveClean(@Body() dto: ApproveCleanTimeOffDto, @CurrentUser() user: AuthUser) {
    return this.cleanTimeOff.approve(dto.ids, user);
  }

  /// The days of time off in a period, for the Timesheet (November 2026).
  @Get('days')
  daysOff(@Query() query: TimeOffDaysQueryDto, @CurrentUser() user: AuthUser) {
    return this.pto.daysOff(query, user);
  }

  /// Time off approved before 2 November 2026 that went past the balance,
  /// and what splitting it into paid and unpaid days would do. Managers.
  @Get('past-balance')
  @Roles(Role.MANAGER)
  pastBalance(@CurrentUser() user: AuthUser) {
    return this.pastBalanceRepair.list(user);
  }

  /// Splits the ones named, worked out afresh. Each person is told.
  @Post('past-balance/split')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  splitPastBalance(@Body() dto: SplitPastBalanceDto, @CurrentUser() user: AuthUser) {
    return this.pastBalanceRepair.split(dto.ids, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pto.findOne(id, user);
  }

  /// Shifts already scheduled inside the requested dates.
  @Get(':id/conflicts')
  @Roles(Role.MANAGER)
  conflicts(@Param('id', ParseUUIDPipe) id: string) {
    return this.pto.conflictingShifts(id);
  }

  /// Too many from one job role off at once, with this request counted -
  /// shown while a manager decides it. See `time-off-clashes.ts`.
  @Get(':id/clashes')
  @Roles(Role.MANAGER)
  clashes(@Param('id', ParseUUIDPipe) id: string) {
    return this.pto.clashes(id);
  }

  // Approving can take shifts off the rota, which can change calendar invites.
  @UseInterceptors(InvitesSyncInterceptor)
  @Patch(':id/review')
  @Roles(Role.MANAGER)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPtoRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pto.review(id, dto, user);
  }

  /// Change somebody's time off: the kind, the dates, a half day, and a
  /// note they read. Waiting or approved, past days included; kept with who
  /// changed it, and the person told. Managers and admins, never their own.
  /// (Replaced `PATCH :id/type`, November 2026.)
  @Patch(':id')
  @Roles(Role.MANAGER)
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditPtoRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pto.edit(id, dto, user);
  }

  /// Withdraw your own, or cancel someone else's as a manager.
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pto.cancel(id, user);
  }
}
