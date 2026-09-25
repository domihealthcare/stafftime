import { EmploymentStatus, PayType, Role } from '@prisma/client';
import {
  ArrayUnique,
  IsInt,
  Max,
  Min,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
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

  /// Optional: without it, time off is not prorated for a first part-year.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  hireDate?: string | null;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  /// Stable id for future Domi EMR linkage. Left null until the EMR side exists.
  @IsOptional()
  @IsString()
  @Length(1, 120)
  externalId?: string;

  /// ADP TotalSource's File # — ADP's own staff number, needed on every row of
  /// the payroll import. Empty or null clears it.
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^[A-Za-z0-9]{1,10}$/, {
    message: 'The ADP File # is letters and numbers only, 10 at most.',
  })
  adpFileNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  badgeId?: string;

  /// Birthday, month and day only — never the year. Null clears it.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(12)
  birthdayMonth?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(31)
  birthdayDay?: number | null;

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
