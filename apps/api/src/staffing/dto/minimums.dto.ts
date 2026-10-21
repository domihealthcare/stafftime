import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MinimumDto {
  @IsUUID('4')
  locationId!: string;

  @IsUUID('4')
  jobRoleId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  minimum!: number;

  /// The weekdays it applies, 1 = Monday ... 7 = Sunday; none: every day.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];
}

/// The whole set, saved at once: an office and role left out has no minimum.
export class SetMinimumsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MinimumDto)
  minimums!: MinimumDto[];
}
