import { IsBoolean } from 'class-validator';

export class UpdatePreferencesDto {
  /// Whether to receive the nightly round-up of what needs a look. Only
  /// managers and admins are ever sent it; an employee setting it changes
  /// nothing, which is simpler than pretending the field does not exist.
  @IsBoolean()
  wantsDailyDigest!: boolean;
}
