import { JOB_ROLE_COLOURS } from '../job-role-colours';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateJobRoleDto {
  @IsOptional()
  @IsBoolean()
  seesOwnPersonnelTabs?: boolean;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(JOB_ROLE_COLOURS, { message: `Colour must be one of: ${JOB_ROLE_COLOURS.join(', ')}.` })
  colour?: string;
}

export class UpdateJobRoleDto {
  /// Whether people in this role see their own licenses and onboarding under
  /// Team. It shows them their own records and nothing more — no power.
  @IsOptional()
  @IsBoolean()
  seesOwnPersonnelTabs?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @IsIn(JOB_ROLE_COLOURS, { message: `Colour must be one of: ${JOB_ROLE_COLOURS.join(', ')}.` })
  colour?: string;
}

export class AddMemberDto {
  @IsUUID()
  employeeId!: string;
}
