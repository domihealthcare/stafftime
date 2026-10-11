import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';
import {
  ChooseSlotDto,
  MeetingOfferDto,
  Review360AnswerDto,
  Review360Dto,
} from './dto/review360.dto';
import { Reviews360Service } from './reviews360.service';

/// 360 feedback: starting one, answering, and the managers' reports.
@Controller('reviews360')
export class Reviews360Controller {
  constructor(private readonly reviews: Reviews360Service) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.reviews.list(user);
  }

  @Get('starter')
  @Roles(Role.MANAGER)
  starter() {
    return this.reviews.starter();
  }

  @Post()
  @Roles(Role.MANAGER)
  create(@Body() dto: Review360Dto, @CurrentUser() user: AuthUser) {
    return this.reviews.create(dto, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.findOne(id, user);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Review360AnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviews.answer(id, dto, user);
  }

  @Post(':id/close')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.close(id);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.remove(id, user);
  }

  @Get(':id/reports')
  @Roles(Role.MANAGER)
  reports(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.reports(id, user);
  }

  @Get(':id/reports/:subjectId')
  @Roles(Role.MANAGER)
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviews.report(id, subjectId, user);
  }

  @Post(':id/reports/:subjectId/meeting')
  @Roles(Role.MANAGER)
  offerMeeting(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: MeetingOfferDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviews.offerMeeting(id, subjectId, dto, user);
  }
}

/// Offers to talk a 360 through: the person picks a time; a manager withdraws.
// Picking or cancelling a time changes a calendar event.
@UseInterceptors(InvitesSyncInterceptor)
@Controller('review-meetings')
export class ReviewMeetingsController {
  constructor(private readonly reviews: Reviews360Service) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.reviews.myMeetings(user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.meeting(id, user);
  }

  @Post(':id/choose')
  @HttpCode(HttpStatus.OK)
  choose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChooseSlotDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviews.choose(id, dto.slotId, user);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.cancelMeeting(id, user);
  }
}
