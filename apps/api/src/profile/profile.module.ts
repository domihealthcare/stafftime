import { Module } from '@nestjs/common';
import { PasswordGuessService } from '../auth/password-guesses.service';
import { PasswordService } from '../auth/password.service';
import { PinService } from '../kiosk/pin.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, PasswordService, PasswordGuessService, PinService],
})
export class ProfileModule {}
