import { EmploymentChangeKind, PayRateUnit } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/// Address and emergency contact, all optional — whatever is to hand. Blank
/// clears a line.
export class PersonalRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactRelationship?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactPhone?: string | null;
}

/// One change of pay or position. The whole row each time, adding or editing.
export class EmploymentChangeDto {
  /// The day it took effect: "2026-10-01".
  @IsDateString()
  effectiveOn!: string;

  @IsEnum(EmploymentChangeKind, {
    message: 'Pick what changed: started, promotion, pay change, position change or other.',
  })
  kind!: EmploymentChangeKind;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Pay is an amount in dollars and cents.' })
  @Min(0, { message: 'Pay cannot be less than nothing.' })
  @Max(10_000_000, { message: 'That pay looks mistyped.' })
  payRate?: number | null;

  @IsOptional()
  @IsEnum(PayRateUnit, { message: 'Pay is per hour or per year.' })
  payUnit?: PayRateUnit | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
