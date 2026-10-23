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
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { PayLockGuard } from '../pay-lock/pay-lock.guard';
import { DecideRaiseDto, LeavingRecordDto, RaiseMeetingDto, RequestRaiseDto } from './dto/pay.dto';
import { EmploymentChangeDto } from './dto/staff-records.dto';
import { PayService } from './pay.service';

/// Pay and raises: for the rota-cost people (checked in the service, whatever
/// their access level), and only after the PIN.
@UseGuards(PayLockGuard)
@Controller('pay')
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.pay.overview(user);
  }

  @Get(':employeeId')
  person(@Param('employeeId', ParseUUIDPipe) employeeId: string, @CurrentUser() user: AuthUser) {
    return this.pay.person(employeeId, user);
  }

  @Post(':employeeId/changes')
  addChange(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: EmploymentChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pay.addChange(employeeId, dto, user);
  }

  @Put('changes/:id')
  updateChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmploymentChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pay.updateChange(id, dto, user);
  }

  @Delete('changes/:id')
  removeChange(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pay.removeChange(id, user);
  }

  @Post(':employeeId/raises')
  requestRaise(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: RequestRaiseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pay.requestRaise(employeeId, dto, user);
  }

  @Put('raises/:id/meeting')
  setMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RaiseMeetingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pay.setMeeting(id, dto, user);
  }

  @Delete('raises/:id/meeting')
  cancelMeeting(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pay.cancelMeeting(id, user);
  }

  @Post('raises/:id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRaiseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pay.decide(id, dto, user);
  }

  @Post('raises/:id/withdraw')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pay.withdraw(id, user);
  }

  @Delete('raises/:id')
  removeRaise(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.pay.removeRaise(id, user);
  }

  @Put(':employeeId/leaving')
  updateLeaving(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: LeavingRecordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pay.updateLeaving(employeeId, dto, user);
  }
}
