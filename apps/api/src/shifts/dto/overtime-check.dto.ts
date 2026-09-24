import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/// "If this shift goes in, where does their week land?" Asked by the scheduler
/// while a shift is being added or assigned, before anything is saved.
export class OvertimeCheckDto {
  @IsUUID('4')
  employeeId!: string;

  @IsUUID('4')
  locationId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  /// The shift being assigned or moved, so its own hours are not counted twice.
  @IsOptional()
  @IsUUID('4')
  shiftId?: string;
}
