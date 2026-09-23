import { ResourceKind } from '@prisma/client';
import {
  IsEnum,
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

export class CreateResourceDto {
  /// Null or absent: everybody sees it.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  jobRoleId?: string | null;

  @IsEnum(ResourceKind)
  kind!: ResourceKind;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  body?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  jobRoleId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  body?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}
