import { Global, Module } from '@nestjs/common';
import { GoogleModule } from '../google/google.module';
import { GoogleCalendarClient } from './google-calendar.client';
import { InvitesController } from './invites.controller';
import { InvitesSyncInterceptor } from './invites-sync.interceptor';
import { CalendarInvitesService } from './invites.service';

/// Calendar invites. Global so the controllers whose saves change somebody's
/// calendar can use the interceptor without a web of imports.
@Global()
@Module({
  imports: [GoogleModule],
  controllers: [InvitesController],
  providers: [GoogleCalendarClient, CalendarInvitesService, InvitesSyncInterceptor],
  exports: [CalendarInvitesService, InvitesSyncInterceptor],
})
export class InvitesModule {}
