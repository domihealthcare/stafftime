import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/// An extension is dialled on a desk phone: digits only, and short.
const EXTENSION = /^\d{1,6}$/;

export class ExtensionLineInput {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  section!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @Matches(EXTENSION, { message: 'An extension is up to six digits.' })
  extension!: string;

  /// The number that rings their mobile when they work from home.
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(EXTENSION, { message: 'A from-home extension is up to six digits.' })
  homeExtension?: string | null;

  /// When they work from home, as written: "Thursday".
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  homeDays?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  employeeId?: string | null;
}

export class SaveExtensionsInput {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ExtensionLineInput)
  lines!: ExtensionLineInput[];
}
