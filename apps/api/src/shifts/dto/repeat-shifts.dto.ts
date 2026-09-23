import { ShiftStatus } from '@prisma/client';
import {
  ArrayNotEmpty,
  ArrayUnique,
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
  Min,
} from 'class-validator';

/// "Every Tuesday and Thursday, 9 to 5, until March."
export class RepeatShiftsDto {
  /// Who works them. Absent makes **open shifts** — slots still to fill.
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  /// What job they are for, when that matters.
  @IsOptional()
  @IsUUID('4')
  jobRoleId?: string;

  /// Worked from home.
  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  /// For open shifts: how many people are needed each time, e.g. two on the
  /// front desk. Ignored when a person is named.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  openCount?: number;

  @IsUUID('4')
  locationId!: string;

  /// Local wall-clock time at the location, "09:00". Stays 9am through a clock
  /// change rather than drifting by an hour.
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM, e.g. 09:00' })
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM, e.g. 17:00' })
  endTime!: string;

  /// 1 = Monday … 7 = Sunday.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek!: number[];

  /// First and last calendar date to consider, inclusive.
  @IsDateString()
  from!: string;

  @IsDateString()
  until!: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/// Copies one week's shifts onto another week.
export class CopyWeekDto {
  /// Monday of the week to copy from, and the Monday to copy onto.
  @IsDateString()
  fromWeekStart!: string;

  @IsDateString()
  toWeekStart!: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  /// Copied shifts land as drafts by default, so a manager reviews before staff
  /// see them.
  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;
}

export class QueryCoverageDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;
}
