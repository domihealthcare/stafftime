import { ShiftStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_EVERY_WEEKS, WEEKS_OF_MONTH } from '../repeat-pattern';

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

  /// Every week (1, the default), or every 2 to 4 weeks.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EVERY_WEEKS)
  everyWeeks?: number;

  /// Only certain weeks of the month: 1–4 for the first to fourth, -1 for the
  /// last — "the first Saturday". Absent or empty: every week.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WEEKS_OF_MONTH, { each: true })
  weeksOfMonth?: number[];

  /// First and last calendar date to consider, inclusive. No last date makes
  /// a **standing shift** — "I always work Mondays" — kept filled a few weeks
  /// ahead by the nightly job until it is stopped.
  @IsDateString()
  from!: string;

  @IsOptional()
  @IsDateString()
  until?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  /// The manager's note, on every shift it makes.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/// Ends a standing shift: nothing after `lastDate` stays on the rota.
export class StopStandingShiftDto {
  /// The last day it runs. Absent: today.
  @IsOptional()
  @IsDateString()
  lastDate?: string;
}

/// Changes a standing shift from a date onward. The person and whether it is
/// published stay as they were; to change those, stop it and make a new one.
export class UpdateStandingShiftDto {
  @IsOptional()
  @IsUUID('4')
  jobRoleId?: string | null;

  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  /// Open shifts only.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  openCount?: number;

  @IsUUID('4')
  locationId!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM, e.g. 09:00' })
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM, e.g. 17:00' })
  endTime!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek!: number[];

  /// Absent: as it was. Every week is 1.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EVERY_WEEKS)
  everyWeeks?: number;

  /// Only certain weeks of the month: 1–4 for the first to fourth, -1 for the
  /// last — "the first Saturday". Absent: as it was; empty: not by
  /// the month.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WEEKS_OF_MONTH, { each: true })
  weeksOfMonth?: number[];

  /// The first day the change applies to. Absent: today.
  @IsOptional()
  @IsDateString()
  from?: string;
}

/// One working day in somebody's usual week: "Monday, 12 to 8, North Bergen".
export class WeeklyDayDto {
  /// 1 = Monday … 7 = Sunday.
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  /// The office — for a work-from-home day, the one it is counted under.
  @IsUUID('4')
  locationId!: string;

  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  jobRoleId?: string | null;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM, e.g. 09:00' })
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM, e.g. 17:00' })
  endTime!: string;
}

/// Somebody's usual week, set in one go (Dominguez, September 2026: a
/// salaried person with different hours or offices on different days used to
/// need a regular shift per day). A day not listed is a day off.
export class SetWeeklyScheduleDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyDayDto)
  days!: WeeklyDayDto[];

  /// The first day it applies to. Absent: today.
  @IsOptional()
  @IsDateString()
  from?: string;

  /// What new shifts are made as. Absent: published — a person's usual week
  /// is not a draft to review.
  @IsOptional()
  @IsIn([ShiftStatus.DRAFT, ShiftStatus.PUBLISHED])
  status?: ShiftStatus;
}

/// Copies one week's shifts onto another week.
export class CopyWeekDto {
  /// The first day of the week to copy from, and of the week to copy onto.
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

/// Publishes drafts together: the ones the manager picked, or a week's worth.
export class PublishShiftsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}

/// The drafts about to be published, to check first ("Before you publish").
export class PublishCheckDto extends PublishShiftsDto {
  /// False for one person's drafts, where the office's open shifts are beside
  /// the point.
  @IsOptional()
  @IsBoolean()
  withOpenShifts?: boolean;
}

/// The open shifts on screen, to suggest somebody for each.
export class SuggestCoverDto extends PublishShiftsDto {}

export class QueryCoverageDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;
}
