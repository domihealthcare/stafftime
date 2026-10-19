import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import {
  ScheduleReviewAreasInput,
  ScheduleReviewDayInput,
  ScheduleReviewPatternInput,
} from './dto/schedule-reviews.dto';
import { ScheduleReviewsService } from './schedule-reviews.service';

/// Who reviews which provider's patient schedule. Everybody signed in reads
/// it; managers and admins change it.
@Controller('schedule-reviews')
export class ScheduleReviewsController {
  constructor(private readonly reviews: ScheduleReviewsService) {}

  @Get()
  days(@Query('from') from: string, @Query('to') to: string) {
    return this.reviews.days(from, to);
  }

  /// Before `days/...`; the groups and their reviewers, for everybody.
  @Get('areas')
  areas() {
    return this.reviews.areas();
  }

  @Put('areas')
  @Roles(Role.MANAGER)
  saveAreas(@Body() dto: ScheduleReviewAreasInput, @CurrentUser() user: AuthUser) {
    return this.reviews.saveAreas(dto, user);
  }

  @Get('pattern')
  pattern() {
    return this.reviews.pattern();
  }

  @Put('pattern')
  @Roles(Role.MANAGER)
  savePattern(@Body() dto: ScheduleReviewPatternInput, @CurrentUser() user: AuthUser) {
    return this.reviews.savePattern(dto, user);
  }

  @Put('days/:date/:providerId')
  @Roles(Role.MANAGER)
  setDay(
    @Param('date') date: string,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: ScheduleReviewDayInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviews.setDay(date, providerId, dto, user);
  }

  @Delete('days/:date/:providerId')
  @Roles(Role.MANAGER)
  clearDay(@Param('date') date: string, @Param('providerId', ParseUUIDPipe) providerId: string) {
    return this.reviews.clearDay(date, providerId);
  }
}
