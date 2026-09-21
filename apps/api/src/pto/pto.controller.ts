import {
  Body,
  Controller,
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
import {
  CreatePtoRequestDto,
  QueryPtoRequestsDto,
  ReviewPtoRequestDto,
  UpdatePtoPolicyDto,
} from './dto/pto.dto';
import { PtoPolicyService } from './pto-policy.service';
import { PtoService } from './pto.service';

@Controller('pto')
export class PtoController {
  constructor(
    private readonly pto: PtoService,
    private readonly policy: PtoPolicyService,
  ) {}

  /// The rules. Readable by everyone — staff should be able to see what they
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
    const target =
      user.role === Role.EMPLOYEE || !employeeId ? user.id : employeeId;
    return this.policy.balanceFor(target, year ? Number(year) : undefined);
  }

  /// Anyone can ask for time off.
  @Post()
  create(@Body() dto: CreatePtoRequestDto, @CurrentUser() user: AuthUser) {
    return this.pto.create(dto, user);
  }

  /// Managers see everyone's; employees are scoped to their own.
  @Get()
  findAll(@Query() query: QueryPtoRequestsDto, @CurrentUser() user: AuthUser) {
    return this.pto.findAll(query, user);
  }

  /// Drives the badge on the Time off tab.
  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.pto.pendingCount(user);
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

  @Patch(':id/review')
  @Roles(Role.MANAGER)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPtoRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pto.review(id, dto, user);
  }

  /// Withdraw your own, or cancel someone else's as a manager.
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pto.cancel(id, user);
  }
}
