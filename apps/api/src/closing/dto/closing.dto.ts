import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
import { ClosingItemKind } from '@prisma/client';

export class ClosingCountDto {
  @IsUUID('4')
  itemId!: string;

  @IsInt()
  @Min(0)
  @Max(100_000)
  value!: number;
}

/// What somebody filled in at clock-out. Ids only, and numbers — never words:
/// there is no free text anywhere in a closing checklist.
export class ClosingSubmissionDto {
  /// They chose to clock out without it.
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;

  /// Position sections ("Check In Desk") they worked today.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  positions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  done?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ClosingCountDto)
  counts?: ClosingCountDto[];

  /// Supplies ticked as needed.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  needed?: string[];
}

export class CreateSectionDto {
  @IsUUID('4')
  jobRoleId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsBoolean()
  isPosition?: boolean;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isPosition?: boolean;
}

export class CreateItemDto {
  @IsUUID('4')
  sectionId!: string;

  @IsEnum(ClosingItemKind)
  kind!: ClosingItemKind;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  text!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  target?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsUUID('4')
  locationId?: string | null;
}

export class UpdateItemDto {
  @IsOptional()
  @IsEnum(ClosingItemKind)
  kind?: ClosingItemKind;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  target?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsUUID('4')
  locationId?: string | null;
}

export class MoveDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

export class ClosingDayQueryDto {
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  date!: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;
}
