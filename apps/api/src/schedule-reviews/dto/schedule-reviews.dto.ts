import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScheduleReviewerInput {
  @IsUUID()
  providerId!: string;

  /// 1 = Monday … 7 = Sunday.
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsUUID()
  reviewerId!: string;
}

/// The whole usual pattern, saved at once.
export class ScheduleReviewPatternInput {
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ScheduleReviewerInput)
  entries!: ScheduleReviewerInput[];
}

/// One day changed: somebody else, or nobody (`reviewerId` null).
export class ScheduleReviewDayInput {
  @IsOptional()
  @IsUUID()
  reviewerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
