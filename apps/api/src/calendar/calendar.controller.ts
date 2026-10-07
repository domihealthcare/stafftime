import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { CalendarService } from './calendar.service';
import { PayDaysQuery } from './pay-days.dto';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /// Whether this employee has a calendar link, and when it was created.
  @Get('link')
  async link(@CurrentUser() user: AuthUser) {
    const { token, setAt } = await this.calendar.currentToken(user.id);
    return { hasLink: token !== null, token, createdAt: setAt };
  }

  /// Creates a link, or replaces the existing one. Replacing invalidates the old.
  @Post('link')
  @HttpCode(HttpStatus.OK)
  issue(@CurrentUser() user: AuthUser) {
    return this.calendar.issueToken(user.id);
  }

  @Delete('link')
  @HttpCode(HttpStatus.OK)
  async revoke(@CurrentUser() user: AuthUser) {
    await this.calendar.revokeToken(user.id);
    return { revoked: true };
  }

  /// Pay days in a range, for the practice calendar: the Friday after each
  /// pay period ends. Anybody signed in.
  @Get('pay-days')
  async payDays(@Query() query: PayDaysQuery) {
    return { payDays: await this.calendar.payDays(query.from, query.to) };
  }

  /**
   * The feed itself.
   *
   * Public because a calendar app cannot send a session cookie or an auth
   * header — the unguessable token in the path is the credential. `.ics` is in
   * the path because some clients decide how to handle a subscription by
   * extension rather than content type.
   */
  @Get(':token/:feed.ics')
  @Public()
  @Header('Cache-Control', 'private, max-age=600')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  /// `domi.ics` is everything in one; `diagnostics.ics`, `rep-lunches.ics`
  /// and the rest of `FEEDS` one kind each, as separate calendars.
  async feed(
    @Param('token') token: string,
    @Param('feed') feed: string,
    @Res() response: Response,
  ) {
    const body = await this.calendar.feedForToken(token, new Date(), feed);
    response
      .status(HttpStatus.OK)
      .setHeader('Content-Type', 'text/calendar; charset=utf-8')
      .setHeader('Content-Disposition', `inline; filename="${feed}.ics"`)
      .send(body);
  }
}
