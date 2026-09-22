import { ShiftStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateShiftDto {
  @IsUUID('4')
  employeeId!: string;

  @IsUUID('4')
  locationId!: string;

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
