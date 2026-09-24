import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Min, ValidateNested } from 'class-validator';
import { ClosingSubmissionDto } from '../../closing/dto/closing.dto';

export class ClockOutDto {
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  accuracyMeters?: number;

  /// The closing checklist, for people whose job role has one. Optional: it
  /// is recorded as not filled in when missing, and never blocks the punch.
  @IsOptional()
  @ValidateNested()
  @Type(() => ClosingSubmissionDto)
  closing?: ClosingSubmissionDto;
}
