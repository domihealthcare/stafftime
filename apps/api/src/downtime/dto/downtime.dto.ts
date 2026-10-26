import { DowntimeCause, DowntimeSystem } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/// Starting a downtime now, or entering a planned one ahead.
export class StartDowntimeInput {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose what is down.' })
  @ArrayMaxSize(3)
  @IsEnum(DowntimeSystem, { each: true })
  systems!: DowntimeSystem[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose the office.' })
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  locationIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /// Entered ahead: starts by itself at `startsAt`.
  @IsOptional()
  @IsBoolean()
  planned?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  plannedEndsAt?: string;
}

export class DowntimeUpdateInput {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class EndDowntimeInput {
  @IsEnum(DowntimeCause, { message: 'Choose what caused it.' })
  cause!: DowntimeCause;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  causeNote?: string;

  /// For a long one: the plan for catching up, and the day it should be done.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  catchUpPlan?: string;

  @IsOptional()
  @IsDateString()
  catchUpDueOn?: string;
}

export class CatchUpInput {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  catchUpPlan?: string;

  @IsOptional()
  @IsDateString()
  catchUpDueOn?: string;
}

export class ContactTickInput {
  @IsBoolean()
  done!: boolean;
}

export class DowntimeContactInput {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(DowntimeSystem, { each: true })
  systems!: DowntimeSystem[];
}

export class DowntimeContactsInput {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DowntimeContactInput)
  contacts!: DowntimeContactInput[];
}

export class KitItemInput {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number | null;
}

export class KitItemsInput {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => KitItemInput)
  items!: KitItemInput[];
}

export class PadProviderInput {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /// Ten digits.
  @Matches(/^\d{10}$/, { message: 'An NPI is 10 digits.' })
  npi!: string;
}

export class PadProvidersInput {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PadProviderInput)
  providers!: PadProviderInput[];
}

/// The monthly check: an office, what is low, and anything to change.
export class DowntimeCheckInput {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  lowItems!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}
