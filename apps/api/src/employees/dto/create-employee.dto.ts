import { EmploymentStatus, PayType, Role } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  preferredName?: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(7, 25)
  phone?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @IsOptional()
  @IsEnum(PayType)
  payType?: PayType;

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  /// Stable id for future Domi EMR linkage. Left null until the EMR side exists.
  @IsOptional()
  @IsString()
  @Length(1, 120)
  externalId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  badgeId?: string;

  /// Locations this employee may work — and therefore clock in at.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  @IsOptional()
  @IsUUID('4')
  primaryLocationId?: string;
}
