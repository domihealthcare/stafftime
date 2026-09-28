import { Module } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';

/// The app's one Google sign-in, for Meet links, calendar invites and Drive.
@Module({
  providers: [GoogleAuthService],
  exports: [GoogleAuthService],
})
export class GoogleModule {}
