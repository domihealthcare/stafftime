import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

/// One row of a pasted staff list, already matched to offices and job roles
/// by the browser, which showed it to the admin before sending.
export class ImportedEmployeeDto extends CreateEmployeeDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  jobRoleIds?: string[];
}

export class ImportEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  // A practice of Domi's size many times over; a paste bigger than this is a
  // mistake, not a staff list.
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ImportedEmployeeDto)
  people!: ImportedEmployeeDto[];
}
