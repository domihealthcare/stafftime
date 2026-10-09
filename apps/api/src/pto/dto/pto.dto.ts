import { PtoStatus, PtoType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  IsNumber,
  Min,
  ValidateBy,
} from 'class-validator';

/// A new request is sick or PTO (VACATION), nothing else (Dominguez,
/// September 2026). The other types stay in the database for requests made
/// before then.
export const REQUESTABLE_PTO_TYPES: PtoType[] = [PtoType.SICK, PtoType.VACATION];

export class CreatePtoRequestDto {
  @IsIn(REQUESTABLE_PTO_TYPES, { message: 'Time off is either Sick or PTO.' })
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

/// Time off already taken, written down by an admin (October 2026): the
/// back-log from before Domi Staff, or a day nobody asked for in the app.
export class RecordPtoDto {
  @IsUUID('4')
  employeeId!: string;

  @IsIn(REQUESTABLE_PTO_TYPES, { message: 'Time off is either Sick or PTO.' })
  type!: PtoType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isHalfDay?: boolean;

  /// Optional — "called out, came back with a doctor's note".
  @IsOptional()
  @IsString()
  @Length(0, 500)
  comment?: string;
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

  /// On approving: what happens to their shifts inside the dates (see
  /// `PtoService.review`). Left out, or KEEP: they stay for a manager to sort.
  @IsOptional()
  @IsIn(['KEEP', 'REMOVE', 'OPEN'])
  shifts?: 'KEEP' | 'REMOVE' | 'OPEN';
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

/// Days: whole or half, from none to a year.
function Days(what: string): PropertyDecorator {
  return (target, key) => {
    IsOptional()(target, key);
    IsNumber({}, { message: `${what} must be a number of days.` })(target, key);
    // Not IsDivisibleBy(0.5): it rounds the divisor down to 0 first.
    ValidateBy({
      name: 'halfDays',
      validator: {
        validate: (value) => typeof value !== 'number' || Number.isInteger(value * 2),
        defaultMessage: () => `${what} must be whole or half days.`,
      },
    })(target, key);
    Min(0, { message: `${what} cannot be below 0.` })(target, key);
    Max(366, { message: `${what} cannot be more than a year.` })(target, key);
  };
}

/**
 * A manager's adjustment for one person (the switch-over, September 2026):
 * their own yearly allowance, and this policy year's starting point. The
 * whole thing is sent each time; a missing or null allowance means the
 * practice's, a missing or null carry-over means "work it out".
 */
export class AdjustPtoBalanceDto {
  @Days('Their yearly PTO')
  vacationDaysPerYear?: number | null;

  @Days('Their yearly sick days')
  sickDaysPerYear?: number | null;

  @Days('PTO already taken')
  vacationUsed?: number | null;

  @Days('Sick days already taken')
  sickUsed?: number | null;

  @Days('PTO carried over')
  vacationCarriedOver?: number | null;

  @Days('Sick days carried over')
  sickCarriedOver?: number | null;
}
