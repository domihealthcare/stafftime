import { EventAudience, MonthlyRepeat, PracticeEventKind, RepeatFrequency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// Who a CHOSEN event is for: any mix of people, job roles and offices.
export class InviteesInput {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  jobRoleIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  locationIds?: string[];
}

/// How it repeats. The dates are worked out from the event's own first day.
export class RepeatInput {
  @IsEnum(RepeatFrequency)
  frequency!: RepeatFrequency;

  @IsInt()
  @Min(1)
  @Max(12)
  interval!: number;

  /// WEEKLY: 1 = Monday … 7 = Sunday.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsEnum(MonthlyRepeat)
  monthlyMode?: MonthlyRepeat;

  /// WEEKDAY_OF_MONTH: 1–4, or -1 for the last.
  @IsOptional()
  @IsInt()
  monthlyWeek?: number;

  /// The last date it may land on, "2026-12-31".
  @Matches(DATE_ONLY, { message: 'until must be a date like 2026-12-31' })
  until!: string;
}

/// A repeating event is changed or removed one date at a time, or from one
/// date onwards.
export class ScopeQuery {
  @IsOptional()
  @IsEnum(['one', 'following'])
  scope?: 'one' | 'following';
}

/// Making or changing an event. A change sends the whole event again, so what
/// is saved is exactly what the form showed.
export class EventInput {
  /// An event (the default), a closure (an office shut), a holiday (a named
  /// day that shuts nothing), a diagnostics date or a rep lunch.
  @IsOptional()
  @IsEnum(PracticeEventKind)
  kind?: PracticeEventKind;

  /// Not for a rep lunch: that is named after its rep.
  @ValidateIf((dto: EventInput) => dto.kind !== PracticeEventKind.REP_LUNCH)
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

  /// A video call to join, pasted from Google Meet, Zoom or Teams.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;

  /// Make a new Google Meet link for it (hosted by the practice account),
  /// instead of a pasted one. A series gets one link for all its dates.
  @IsOptional()
  @IsBoolean()
  createMeetLink?: boolean;

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

  /// A diagnostics date or rep lunch: the office it is at.
  @IsOptional()
  @IsUUID()
  atLocationId?: string;

  /// A rep lunch: the rep, from the list. Its title is made from their name.
  @IsOptional()
  @IsUUID()
  repId?: string;

  /// For CHOSEN.
  @IsOptional()
  @ValidateNested()
  @Type(() => InviteesInput)
  invitees?: InviteesInput;

  /// Closures and holidays only, when making one: also put it on the same
  /// date in each of the next this-many years ("Christmas Day, every year").
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  yearsAhead?: number;

  /// Absent or null: it happens once.
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatInput)
  repeat?: RepeatInput | null;
}

export class QueryEventsDto {
  /// Inclusive start of the window.
  @IsDateString()
  from!: string;

  /// Exclusive end of the window.
  @IsDateString()
  to!: string;
}

export class CopyClosuresDto {
  /// The year to copy from; the closures land in the year after.
  @IsInt()
  @Min(2020)
  @Max(2100)
  fromYear!: number;
}
