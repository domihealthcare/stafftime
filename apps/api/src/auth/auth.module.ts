import { WelcomeController } from './welcome.controller';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordGuessService } from './password-guesses.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PasskeysController } from '../passkeys/passkeys.controller';
import { PasskeysService } from '../passkeys/passkeys.service';

@Module({
  controllers: [AuthController, WelcomeController, PasskeysController],
  providers: [
    AuthService,
    PasswordService,
    PasswordGuessService,
    PasswordResetService,
    SessionService,
    LoginThrottleService,
    PasskeysService,
  ],
  exports: [
    AuthService,
    PasswordGuessService,
    PasswordService,
    PasswordResetService,
    SessionService,
    LoginThrottleService,
    PasskeysService,
  ],
})
export class AuthModule {}
