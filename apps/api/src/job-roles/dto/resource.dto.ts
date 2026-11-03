import { ResourceKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

/// The most links added in one go: a whole bookmarks folder, not a whole
/// browser's worth.
export const MAX_IMPORTED_LINKS = 300;

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

/// One link from a pasted list or a browser's bookmarks file (November 2026).
export class ImportedLinkDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  jobRoleId?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(2000)
  url!: string;
}

export class ImportLinksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORTED_LINKS)
  @ValidateNested({ each: true })
  @Type(() => ImportedLinkDto)
  links!: ImportedLinkDto[];
}
