import { StudentKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/// Adding or changing a student. A change sends the whole student again, so
/// what is saved is what the form showed. Names only: nothing to reach them
/// by, no date of birth, no paperwork.
export class StudentInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(StudentKind)
  kind!: StudentKind;

  /// Their school or program: "Rutgers NJMS, 3rd year".
  @IsOptional()
  @IsString()
  @MaxLength(160)
  school?: string;
}
