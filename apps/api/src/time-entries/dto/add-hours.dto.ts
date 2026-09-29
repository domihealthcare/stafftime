import { HandEntryReason } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

/// A manager entering a day that has no punch at all — somebody forgot, or the
/// app would not let them. Always with a reason, because every one of these is
/// looked into afterwards (Dominguez, September 2026).
export class AddHoursDto {
  @IsUUID('4')
  employeeId!: string;

  @IsUUID('4')
  locationId!: string;

  @IsDateString()
  clockInAt!: string;

  @IsDateString()
  clockOutAt!: string;

  @IsEnum(HandEntryReason)
  reason!: HandEntryReason;

  /// What happened, in the manager's words — the start of finding out why.
  @IsString()
  @Length(3, 500)
  note!: string;

  /// Set when the manager has been told this day's pay period already went to
  /// payroll and means to add the hours anyway.
  @IsOptional()
  @IsBoolean()
  acknowledgeExported?: boolean;
}

/// Somebody has looked into why hours had to be entered by hand.
export class CheckHandEntryDto {
  /// What they found, if anything worth writing down.
  @IsOptional()
  @IsString()
  @Length(0, 500)
  finding?: string;
}
