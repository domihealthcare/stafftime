import { ShiftStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class QueryShiftsDto {
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  /// Inclusive start of the window to return shifts for.
  @IsOptional()
  @IsDateString()
  from?: string;

  /// Exclusive end of the window.
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;
}
