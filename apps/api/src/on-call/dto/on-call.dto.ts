import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export class OnCallEntryInput {
  /// 1 = Monday … 7 = Sunday.
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  /// 0 every week; 1–4 the first to fourth; -1 the last.
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, -1])
  weekOfMonth!: number;

  @IsUUID()
  employeeId!: string;
}

/// The usual pattern, from a day on.
export class OnCallRotaInput {
  @Matches(DATE_ONLY, { message: 'Give the first day as a date.' })
  startsOn!: string;

  @Matches(CLOCK, { message: 'Give the hand-over time as hours and minutes, like 12:00.' })
  changesAt!: string;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => OnCallEntryInput)
  entries!: OnCallEntryInput[];
}

/// One day changed, or put back to the usual (`employeeId` null).
export class OnCallDayInput {
  @IsOptional()
  @IsUUID()
  employeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/// "Can you take my Saturday?" — and, if offered, a day of theirs back.
export class OnCallSwapInput {
  @Matches(DATE_ONLY, { message: 'Choose your day as a date.' })
  giveDate!: string;

  @IsUUID()
  partnerId!: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Choose their day as a date.' })
  takeDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
