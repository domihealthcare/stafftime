import { LeavingKind, PayRateUnit } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PAY_NOTE_LENGTH } from '../pay-notes';

const RATE = { maxDecimalPlaces: 2 } as const;
const RATE_MESSAGE = { message: 'Pay is an amount in dollars and cents.' };

/// A raise asked for: the day, and what was asked if anything was.
export class RequestRaiseDto {
  @IsDateString()
  requestedOn!: string;

  @IsOptional()
  @IsNumber(RATE, RATE_MESSAGE)
  @Min(0, { message: 'Pay cannot be less than nothing.' })
  @Max(10_000_000, { message: 'That pay looks mistyped.' })
  askedRate?: number | null;

  @IsOptional()
  @IsEnum(PayRateUnit, { message: 'Pay is per hour or per year.' })
  askedUnit?: PayRateUnit | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/// The meeting about it, made as a practice event for the two of them.
export class RaiseMeetingDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string | null;

  @IsOptional()
  @IsBoolean()
  createMeetLink?: boolean;
}

export const RAISE_OUTCOMES = ['OFFERED', 'APPROVED', 'DECLINED'] as const;
export type RaiseOutcome = (typeof RAISE_OUTCOMES)[number];

/// The answer. Offered and approved need the new pay; approved also the day
/// it takes effect, which may be past or still to come.
export class DecideRaiseDto {
  @IsIn(RAISE_OUTCOMES, { message: 'Pick offered, approved or declined.' })
  outcome!: RaiseOutcome;

  @IsOptional()
  @IsNumber(RATE, RATE_MESSAGE)
  @Min(0, { message: 'Pay cannot be less than nothing.' })
  @Max(10_000_000, { message: 'That pay looks mistyped.' })
  newRate?: number | null;

  @IsOptional()
  @IsEnum(PayRateUnit, { message: 'Pay is per hour or per year.' })
  newUnit?: PayRateUnit | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  newPosition?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/// Why somebody left. All optional; blank clears.
export class LeavingRecordDto {
  @IsOptional()
  @IsEnum(LeavingKind, { message: 'Pick how they left.' })
  kind?: LeavingKind | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @IsOptional()
  @IsDateString()
  lastPaycheckOn?: string | null;
}

/// A note on somebody's pay: the words, and the day it happened (today if
/// left out). Who it is about is in the address.
export class PayNoteDto {
  @IsString()
  @MaxLength(MAX_PAY_NOTE_LENGTH)
  body!: string;

  @IsOptional()
  @IsDateString()
  notedOn?: string | null;

  /// People on Pay & raises to tell about it ("Let someone know"). On an
  /// edit, only the ones not told before are told.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  notify?: string[];
}
