import { ShiftStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

export class CreateShiftDto {
  /// Who works it. Null or absent makes an **open shift** — a slot at a
  /// location that still needs somebody.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  employeeId?: string | null;

  @IsUUID('4')
  locationId!: string;

  /// What job the shift is for, when that matters (Front Desk, MA…).
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  jobRoleId?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;
}
