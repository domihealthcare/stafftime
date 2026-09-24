import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing/closing.module';
import { TimeEntriesModule } from '../time-entries/time-entries.module';
import { KioskController } from './kiosk.controller';
import { KioskDeviceGuard } from './kiosk.guard';
import { KioskPunchService } from './kiosk-punch.service';
import { KioskService } from './kiosk.service';
import { PinService } from './pin.service';

@Module({
  imports: [TimeEntriesModule, ClosingModule],
  controllers: [KioskController],
  providers: [KioskService, KioskPunchService, PinService, KioskDeviceGuard],
  exports: [KioskService, PinService],
})
export class KioskModule {}
