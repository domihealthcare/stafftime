import { PtoStatus, PtoType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreatePtoRequestDto {
  @IsEnum(PtoType)
  type!: PtoType;

  /// First day off, inclusive. A plain date: "2026-11-03".
  @IsDateString()
  startDate!: string;

  /// Last day off, inclusive. Same as startDate for a single day.
  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isHalfDay?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;

  /// Managers may file a request on someone else's behalf — for the person who
  /// phones in sick rather than opening the app.
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;
}

export class ReviewPtoRequestDto {
  @IsEnum(PtoStatus, { message: 'A decision must be APPROVED or DENIED.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  decision!: PtoStatus;

  /// Shown to the employee. Required when denying — "no" without a reason is
  /// how a request turns into a conversation nobody has a record of.
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reviewNote?: string;
}

export class QueryPtoRequestsDto {
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @IsOptional()
  @IsEnum(PtoStatus)
  status?: PtoStatus;

  @IsOptional()
  @IsEnum(PtoType)
  type?: PtoType;

  /// Requests overlapping this window.
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/// The practice's rules. Every field optional — an admin changes one line at a
/// time, not the whole policy.
export class UpdatePtoPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  vacationDaysPerYear?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  sickDaysPerYear?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  maxCarryoverDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  sickCarryoverDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  yearStartMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  yearStartDay?: number;

  @IsOptional()
  @IsBoolean()
  prorateFirstYear?: boolean;
}
