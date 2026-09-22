import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePracticeSettingsDto {
  /**
   * Hours in a week past which the rota warns.
   *
   * Bounded rather than free: below about twenty the warning fires for every
   * part-timer and stops meaning anything, and above sixty it would never fire
   * at all — either way the setting quietly turns the feature off, which is not
   * what somebody adjusting a number expects to have done.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(60)
  overtimeThresholdHours?: number;

  /// How close the coming week has to be before an unpublished rota is chased.
  /// Seven would mean being told every night for a week, which is how a daily
  /// email gets filtered.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  rotaWarningDays?: number;
}
