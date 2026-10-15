import { ReferenceAudience } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/// Making a reference table, or changing one. A change sends it whole, so
/// what is saved is exactly what the screen showed.
export class ReferenceTableInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsEnum(ReferenceAudience)
  audience!: ReferenceAudience;

  @IsInt()
  @Min(0)
  @Max(5)
  headerRows!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  keyColumns!: number;

  /// Pasted from the spreadsheet — read into rows on the server. Either this
  /// or `rows`.
  @IsOptional()
  @IsString()
  @MaxLength(250_000)
  pasted?: string;

  /// The rows as edited on screen: string[][], checked in the service.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  rows?: unknown[];
}
