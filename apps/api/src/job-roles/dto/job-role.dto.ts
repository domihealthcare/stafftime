import { JOB_ROLE_COLOURS } from '../job-role-colours';
import {
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
