import { CredentialKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/// One job role that needs a license type, and whether it is required.
export class CredentialRequirementDto {
  @IsUUID()
  jobRoleId!: string;

  @IsBoolean()
  required!: boolean;
}

export class CreateCredentialTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEnum(CredentialKind)
  kind!: CredentialKind;

  /// How often it is renewed, in months. Omitted or null when it varies.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  renewalMonths?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CredentialRequirementDto)
  requirements?: CredentialRequirementDto[];
}

export class UpdateCredentialTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(CredentialKind)
  kind?: CredentialKind;

  /// Null clears it.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  renewalMonths?: number | null;

  /// Replaces the whole list when given.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CredentialRequirementDto)
  requirements?: CredentialRequirementDto[];
}
