import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { OnCallDayInput, OnCallRotaInput, OnCallSwapInput } from './dto/on-call.dto';
import { CallRoutingSettingsInput, OnCallCoverInput } from './dto/call-routing.dto';
import { OnCallRoutingService } from './on-call-routing.service';
import { OnCallService } from './on-call.service';

/// The provider on-call schedule. Providers, managers and admins read it
/// (checked in the service); managers and admins change it; providers swap.
@Controller('on-call')
export class OnCallController {
  constructor(
    private readonly onCall: OnCallService,
    private readonly routing: OnCallRoutingService,
  ) {}

  @Get()
  schedule(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    return this.onCall.schedule(user, from, to);
  }

  @Get('rotas')
  rotas(@CurrentUser() user: AuthUser) {
    return this.onCall.rotas(user);
  }

  @Put('rotas')
  @Roles(Role.MANAGER)
  saveRota(@Body() dto: OnCallRotaInput, @CurrentUser() user: AuthUser) {
    return this.onCall.saveRota(dto, user);
  }

  @Delete('rotas/:startsOn')
  @Roles(Role.MANAGER)
  removeRota(@Param('startsOn') startsOn: string, @CurrentUser() user: AuthUser) {
    return this.onCall.removeRota(startsOn, user);
  }

  @Put('days/:date')
  @Roles(Role.MANAGER)
  setDay(@Param('date') date: string, @Body() dto: OnCallDayInput, @CurrentUser() user: AuthUser) {
    return this.onCall.setDay(date, dto, user);
  }

  @Get('swaps')
  swaps(@CurrentUser() user: AuthUser) {
    return this.onCall.swaps(user);
  }

  @Post('swaps')
  askSwap(@Body() dto: OnCallSwapInput, @CurrentUser() user: AuthUser) {
    return this.onCall.askSwap(dto, user);
  }

  @Post('swaps/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.onCall.answerSwap(id, true, user);
  }

  @Post('swaps/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.onCall.answerSwap(id, false, user);
  }

  @Post('swaps/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.onCall.cancelSwap(id, user);
  }

  @Get('routing')
  @Roles(Role.MANAGER)
  routingView(
    @Query('from') from: string,
    @Query('days') days: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.routing.routingView(user, from, days === undefined ? 60 : Number(days));
  }

  @Get('routing/settings')
  @Roles(Role.MANAGER)
  routingSettings(@CurrentUser() user: AuthUser) {
    return this.routing.settings(user);
  }

  @Put('routing/settings')
  @Roles(Role.MANAGER)
  saveRoutingSettings(@Body() dto: CallRoutingSettingsInput, @CurrentUser() user: AuthUser) {
    return this.routing.saveSettings(dto, user);
  }

  /// Overrides on top of the schedule: read by whoever sees the schedule.
  @Get('covers')
  async covers(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!(await this.onCall.canSee(user))) {
      throw new ForbiddenException('The on-call schedule is for providers, managers and admins.');
    }
    return this.routing.listCovers(from, to);
  }

  @Post('covers')
  @Roles(Role.MANAGER)
  createCover(@Body() dto: OnCallCoverInput, @CurrentUser() user: AuthUser) {
    return this.routing.createCover(dto, user);
  }

  @Put('covers/:id')
  @Roles(Role.MANAGER)
  updateCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OnCallCoverInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.routing.updateCover(id, dto, user);
  }

  @Delete('covers/:id')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCover(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.routing.deleteCover(id, user);
  }
}
