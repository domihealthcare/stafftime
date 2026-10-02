import { ClockMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

  /// Working from home, chosen on the phone (October 2026): true even with no
  /// work-from-home shift — then it is flagged as somewhere other than the
  /// shift. Left out (an older page), a work-from-home shift on now still
  /// makes the punch from home, as before.
  @IsOptional()
  @IsBoolean()
  workFromHome?: boolean;

  /// Why they are clocking in somewhere other than their shift, if they said.
  /// Optional; kept only when it is somewhere other.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  otherPlaceReason?: string;

  /// Kiosk punches identify the employee; everyone else is the signed-in user.
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;
}
