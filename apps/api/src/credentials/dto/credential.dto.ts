import { CredentialKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCredentialDto {
  @IsUUID()
  employeeId!: string;

  /// One of the practice's license types. Its name and kind are used when
  /// these are left out, and its renewal interval suggests the expiry.
  @IsOptional()
  @IsUUID()
  credentialTypeId?: string;

  @ValidateIf((dto: CreateCredentialDto) => !dto.credentialTypeId || dto.kind !== undefined)
  @IsEnum(CredentialKind)
  kind?: CredentialKind;

  @ValidateIf((dto: CreateCredentialDto) => !dto.credentialTypeId || dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  issuer?: string;

  @IsOptional()
  @IsISO8601()
  issuedOn?: string;

  /// Left out when the type's renewal interval can work it out from issuedOn.
  @IsOptional()
  @IsISO8601()
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/// Everything is replaceable, including the expiry — a renewal is usually the
/// same credential with a new date on it.
export class UpdateCredentialDto {
  @IsOptional()
  @IsEnum(CredentialKind)
  kind?: CredentialKind;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  issuer?: string;

  @IsOptional()
  @IsISO8601()
  issuedOn?: string;

  @IsOptional()
  @IsISO8601()
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class QueryCredentialsDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(CredentialKind)
  kind?: CredentialKind;

  /// Only what expires within this many days — the question a practice manager
  /// actually asks. Anything already expired is always included.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  withinDays?: number;

  /// Retired credentials are hidden unless asked for.
  @IsOptional()
  @IsEnum(['active', 'archived', 'all'] as const)
  state?: 'active' | 'archived' | 'all';
}
