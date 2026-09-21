import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

/// A manager correcting a punch. Every edit demands a reason — this is the
/// audit trail a payroll dispute gets resolved with.
export class EditTimeEntryDto {
  @IsOptional()
  @IsDateString()
  clockInAt?: string;

  @IsOptional()
  @IsDateString()
  clockOutAt?: string;

  @IsString()
  @Length(3, 500)
  editReason!: string;
}
