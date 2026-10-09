import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class MinimumDto {
  @IsUUID('4')
  locationId!: string;

  @IsUUID('4')
  jobRoleId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  minimum!: number;
}

/// The whole set, saved at once: an office and role left out has no minimum.
export class SetMinimumsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MinimumDto)
  minimums!: MinimumDto[];
}
