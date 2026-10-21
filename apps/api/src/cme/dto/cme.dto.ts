import { CmeFormat } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_CENTS } from '../cme';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// A provider's request. Costs in cents.
export class CmeRequestInput {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizer?: string;

  @IsEnum(CmeFormat)
  format!: CmeFormat;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @Matches(DATE_ONLY, { message: 'Give the day as a date.' })
  startsOn!: string;

  @Matches(DATE_ONLY, { message: 'Give the day as a date.' })
  endsOn!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  credits?: number | null;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  registrationCents!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  travelCents!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  lodgingCents!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  otherCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/// Approved, at what was asked or a lower (or higher) amount.
export class CmeApproveInput {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS * 4)
  approvedCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CmeDeclineInput {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CmeReimbursedInput {
  @Matches(DATE_ONLY, { message: 'Give the day as a date.' })
  reimbursedOn!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS * 4)
  reimbursedCents!: number;
}

/// A provider's yearly allowance; null takes it away.
export class CmeAllowanceInput {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS * 4)
  amountCents?: number | null;
}
