import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PayLockGuard } from '../pay-lock/pay-lock.guard';
import { Roles } from '../common/auth/roles.decorator';
import {
  MoveInput,
  ReimbursementCodeInput,
  ReimbursementPayerInput,
  ReimbursementRateInput,
} from './dto/reimbursements.dto';
import { ReimbursementsService } from './reimbursements.service';

/// The reimbursements board: managers and admins only, reading and keeping.
/// Every change answers with the whole board, as it now stands.
/// Shows pay: only after the PIN (October 2026, `pay-lock/`).
@UseGuards(PayLockGuard)
@Controller('reimbursements')
@Roles(Role.MANAGER)
export class ReimbursementsController {
  constructor(private readonly reimbursements: ReimbursementsService) {}

  @Get()
  board() {
    return this.reimbursements.board();
  }

  @Put('rates')
  setRate(@Body() dto: ReimbursementRateInput, @CurrentUser() user: AuthUser) {
    return this.reimbursements.setRate(dto, user);
  }

  @Post('codes')
  createCode(@Body() dto: ReimbursementCodeInput, @CurrentUser() user: AuthUser) {
    return this.reimbursements.createCode(dto, user);
  }

  @Put('codes/:id')
  updateCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReimbursementCodeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reimbursements.updateCode(id, dto, user);
  }

  @Post('codes/:id/move')
  moveCode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveInput) {
    return this.reimbursements.moveCode(id, dto.by);
  }

  @Delete('codes/:id')
  removeCode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reimbursements.removeCode(id, user);
  }

  @Post('payers')
  createPayer(@Body() dto: ReimbursementPayerInput, @CurrentUser() user: AuthUser) {
    return this.reimbursements.createPayer(dto, user);
  }

  @Put('payers/:id')
  updatePayer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReimbursementPayerInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reimbursements.updatePayer(id, dto, user);
  }

  @Post('payers/:id/move')
  movePayer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveInput) {
    return this.reimbursements.movePayer(id, dto.by);
  }

  @Delete('payers/:id')
  removePayer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reimbursements.removePayer(id, user);
  }
}
