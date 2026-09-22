import { ClockMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class ClockInDto {
  @IsUUID('4')
  locationId!: string;

  @IsEnum(ClockMethod)
  method!: ClockMethod;

  /// Browser geolocation. Required for WEB/MOBILE unless the request comes from
  /// an allow-listed office IP.
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  /// `coords.accuracy` from the browser, in metres.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  accuracyMeters?: number;

  /// Kiosk punches identify the employee; everyone else is the signed-in user.
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;
}
