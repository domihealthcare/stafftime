import { EventAudience } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// Making or changing an event. A change sends the whole event again, so what
/// is saved is exactly what the form showed.
export class EventInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @IsBoolean()
  allDay!: boolean;

  /// A timed event: the instants it starts and ends.
  @ValidateIf((dto: EventInput) => !dto.allDay)
  @IsDateString()
  startsAt?: string;

  @ValidateIf((dto: EventInput) => !dto.allDay)
  @IsDateString()
  endsAt?: string;

  /// An all-day event: its first and last day, "2026-10-15", in New Jersey.
  @ValidateIf((dto: EventInput) => dto.allDay)
  @Matches(DATE_ONLY, { message: 'startDate must be a date like 2026-10-15' })
  startDate?: string;

  @ValidateIf((dto: EventInput) => dto.allDay)
  @Matches(DATE_ONLY, { message: 'endDate must be a date like 2026-10-15' })
  endDate?: string;

  @IsEnum(EventAudience)
  audience!: EventAudience;

  @IsOptional()
  @IsUUID()
  jobRoleId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class QueryEventsDto {
  /// Inclusive start of the window.
  @IsDateString()
  from!: string;

  /// Exclusive end of the window.
  @IsDateString()
  to!: string;
}
