import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PinService } from '../kiosk/pin.service';
import { PayLockController } from './pay-lock.controller';
import { PayLockService } from './pay-lock.service';

@Module({
  imports: [AuthModule],
  controllers: [PayLockController],
  providers: [PayLockService, PinService],
})
export class PayLockModule {}
