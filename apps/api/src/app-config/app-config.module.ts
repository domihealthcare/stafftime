import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AppConfigController } from './app-config.controller';

@Module({ imports: [EventsModule], controllers: [AppConfigController] })
export class AppConfigModule {}
