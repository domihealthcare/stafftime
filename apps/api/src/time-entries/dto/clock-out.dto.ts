import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Min } from 'class-validator';

export class ClockOutDto {
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  accuracyMeters?: number;
}
