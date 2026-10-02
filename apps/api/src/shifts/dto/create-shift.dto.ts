import { ShiftStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateShiftDto {
  /// Who works it. Null or absent makes an **open shift** — a slot at a
  /// location that still needs somebody.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  employeeId?: string | null;

  @IsUUID('4')
  locationId!: string;

  /// What job the shift is for (Front Desk, MA…). For somebody's shift, one
  /// of the roles they hold — see `held-job-role.ts`; for an open one, any.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  jobRoleId?: string | null;

  /// Worked from home: clocking in during it needs no office check.
  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  /// The manager's note — "7–12 upstairs, 12–3 downstairs". Shown to the
  /// person on it, and on the printed rota. On an edit, null (or blank)
  /// clears it.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
