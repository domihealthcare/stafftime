import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lower-case words separated by hyphens',
  })
  slug!: string;

  @IsString()
  @Length(1, 160)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  addressLine2?: string;

  @IsString()
  @Length(1, 80)
  city!: string;

  @IsString()
  @Length(2, 2)
  state!: string;

  @IsString()
  @Length(5, 10)
  postalCode!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsLatitude()
  @Type(() => Number)
  latitude!: number;

  @IsLongitude()
  @Type(() => Number)
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  geofenceRadiusMeters?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsBoolean()
  kioskEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
