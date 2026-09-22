import { TimeEntryStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ALL_COLUMN_KEYS, type TimesheetColumnKey } from '../columns';

export class ExportTimesheetDto {
  /// Inclusive start of the period.
  @IsDateString()
  from!: string;

  /// Exclusive end of the period.
  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  /// Which entries to include. Defaults to work that is finished and signed off.
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TimeEntryStatus, { each: true })
  statuses?: TimeEntryStatus[];

  /// Entries with no clock-out. Off by default: they have no hours to pay, and
  /// including them silently would understate a total that looks complete.
  @IsOptional()
  @IsBoolean()
  includeOpen?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(ALL_COLUMN_KEYS, { each: true })
  columns?: TimesheetColumnKey[];

  /// A second sheet of per-employee totals for the period.
  @IsOptional()
  @IsBoolean()
  includeSummary?: boolean;

  /// Split each hourly employee's week into regular and overtime hours.
  @IsOptional()
  @IsBoolean()
  splitOvertime?: boolean;

  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => (typeof value === 'string' ? value : undefined))
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv';

  /// Which payroll target to produce for. Defaults to the spreadsheet, which
  /// is what the practice runs payroll on until ADP's details arrive.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  target?: string;
}
