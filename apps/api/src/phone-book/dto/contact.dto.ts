import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/// One place to go: an address with its own phone and fax.
export class OfficeInput {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  /// Several numbers may be written in one box.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fax?: string | null;
}

/// One entry in the phone book, added or changed. A change sends it whole,
/// offices included.
export class ContactInput {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  category!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /// The practice, for the whole entry (October 2026).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  practice?: string | null;

  @IsOptional()
  @IsBoolean()
  preferred?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OfficeInput)
  offices?: OfficeInput[];
}
