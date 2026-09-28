import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { from, Observable, switchMap } from 'rxjs';
import { CalendarInvitesService } from './invites.service';

/**
 * After a save that could change somebody's calendar — a shift, an event, a
 * person, an office, a job role's members — brings the invites up to date
 * before answering. Awaited, not left running: on Vercel anything still
 * going after the response is frozen.
 *
 * Never fails the save: a Google hiccup is logged, shown in Practice
 * settings, and put right on the next round.
 */
@Injectable()
export class InvitesSyncInterceptor implements NestInterceptor {
  constructor(private readonly invites: CalendarInvitesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = context.switchToHttp().getRequest<Request>().method;
    if (method === 'GET' || !this.invites.enabled) return next.handle();
    return next
      .handle()
      .pipe(switchMap((result) => from(this.invites.syncQuietly().then(() => result))));
  }
}
