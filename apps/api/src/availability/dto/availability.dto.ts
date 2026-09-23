import { UnavailabilityKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateUnavailabilityDto {
  @IsEnum(UnavailabilityKind)
  kind!: UnavailabilityKind;

  @ValidateIf((dto: CreateUnavailabilityDto) => dto.kind === UnavailabilityKind.WEEKLY)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ValidateIf((dto: CreateUnavailabilityDto) => dto.kind === UnavailabilityKind.ONE_OFF)
  @IsISO8601()
  date?: string;

  /// Both or neither. Neither means the whole day.
  @IsOptional()
  @Matches(TIME, { message: 'Times are HH:MM, like 17:00.' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME, { message: 'Times are HH:MM, like 17:00.' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class QueryAvailabilityDto {
  /// Managers only: somebody else's.
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
