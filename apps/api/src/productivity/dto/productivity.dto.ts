import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/// A whole day, the way every date here travels.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/// A plan is only defaults, and every part of it is optional. `null` clears one.
export class SavePlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  intervalWeeks!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  intervalsPerStatement!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  expectedPerInterval?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  multiplier?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(40, { each: true })
  categories?: string[];
}

export class NewStatementDto {
  @IsUUID()
  employeeId!: string;

  /// The first day. Left out, it follows the provider's last statement.
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DAY, { message: 'Dates must be given as YYYY-MM-DD.' })
  startDate?: string;
}

export class CountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  count!: number;
}

export class IntervalDto {
  @IsISO8601({ strict: true })
  @Matches(DAY, { message: 'Dates must be given as YYYY-MM-DD.' })
  startDate!: string;

  @IsISO8601({ strict: true })
  @Matches(DAY, { message: 'Dates must be given as YYYY-MM-DD.' })
  endDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  expected?: number | null;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CountDto)
  counts!: CountDto[];
}

/// The whole statement as the form shows it: what is sent is what is saved.
export class SaveStatementDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => IntervalDto)
  intervals!: IntervalDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  multiplier?: number | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(DAY, { message: 'Dates must be given as YYYY-MM-DD.' })
  paidOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
