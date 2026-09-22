import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';

/// A manager correcting a punch. Every edit demands a reason — this is the
/// audit trail a payroll dispute gets resolved with.
export class EditTimeEntryDto {
  @IsOptional()
  @IsDateString()
  clockInAt?: string;

  @IsOptional()
  @IsDateString()
  clockOutAt?: string;

  /// Explicitly removes an existing clock-out, turning the entry back into a
  /// missing punch. Omitting clockOutAt means "leave it alone", which is not
  /// the same thing.
  @IsOptional()
  @IsBoolean()
  clearClockOut?: boolean;

  @IsString()
  @Length(3, 500)
  editReason!: string;

  /// Set when the manager has been told these hours already went to payroll and
  /// means to correct them anyway. Without it the edit is refused, so a
  /// correction to paid hours is never made by accident.
  @IsOptional()
  @IsBoolean()
  acknowledgeExported?: boolean;
}
