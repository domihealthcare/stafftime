import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CmeService } from './cme.service';
import {
  CmeAllowanceInput,
  CmeApproveInput,
  CmeDeclineInput,
  CmeReimbursedInput,
  CmeRequestInput,
} from './dto/cme.dto';

/// CME requests: providers ask about their own; managers and admins decide,
/// record payment and set allowances.
@Controller('cme')
export class CmeController {
  constructor(private readonly cme: CmeService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.cme.mine(user);
  }

  @Post()
  create(@Body() dto: CmeRequestInput, @CurrentUser() user: AuthUser) {
    return this.cme.create(dto, user);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.cme.withdraw(id, user);
  }

  @Get()
  @Roles(Role.MANAGER)
  all() {
    return this.cme.all();
  }

  @Post(':id/approve')
  @Roles(Role.MANAGER)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CmeApproveInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cme.approve(id, dto, user);
  }

  @Post(':id/decline')
  @Roles(Role.MANAGER)
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CmeDeclineInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cme.decline(id, dto.reason, user);
  }

  @Post(':id/reimbursed')
  @Roles(Role.MANAGER)
  reimbursed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CmeReimbursedInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cme.reimbursed(id, dto, user);
  }

  @Put('allowances/:employeeId')
  @Roles(Role.MANAGER)
  setAllowance(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CmeAllowanceInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cme.setAllowance(employeeId, dto, user);
  }
}
