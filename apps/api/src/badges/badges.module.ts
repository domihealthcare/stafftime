import { Module } from '@nestjs/common';
import { DowntimeModule } from '../downtime/downtime.module';
import { PtoModule } from '../pto/pto.module';
import { BadgesController } from './badges.controller';

/// The one request behind the bell, the downtime bar and the time-off badge.
/// `InboxService` comes from the global email module.
@Module({
  imports: [DowntimeModule, PtoModule],
  controllers: [BadgesController],
})
export class BadgesModule {}
