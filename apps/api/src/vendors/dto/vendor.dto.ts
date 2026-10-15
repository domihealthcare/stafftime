import { VendorPaymentMethod, VendorPaymentStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class VendorInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/// A payment, made or changed. A change sends it whole.
export class VendorPaymentInput {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  forWhat!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceNumber?: string;

  @IsEnum(VendorPaymentMethod)
  method!: VendorPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  checkNumber?: string;

  /// Dollars and cents.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  amount?: number | null;

  @IsEnum(VendorPaymentStatus)
  status!: VendorPaymentStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DATE_ONLY, { message: 'sentOn must be a date like 2026-10-15' })
  sentOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DATE_ONLY, { message: 'completedOn must be a date like 2026-10-15' })
  completedOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
