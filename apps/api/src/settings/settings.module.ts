import { Global, Module } from '@nestjs/common';
import { PracticeSettingsService } from './practice-settings.service';
import { SettingsController } from './settings.controller';

/// Global because the rules apply across features — the scheduler warns with
/// them, the nightly round-up chases with them — and neither should have to
/// import a module to read a number.
@Global()
@Module({
  controllers: [SettingsController],
  providers: [PracticeSettingsService],
  exports: [PracticeSettingsService],
})
export class SettingsModule {}
