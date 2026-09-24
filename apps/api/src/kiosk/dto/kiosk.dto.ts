import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ClosingSubmissionDto } from '../../closing/dto/closing.dto';

export class PairKioskDto {
  /// Typed on the tablet, so hyphens and lower case are accepted and normalised.
  @IsString()
  @Length(10, 20)
  pairingCode!: string;
}

export class CreateKioskDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsUUID('4')
  locationId!: string;
}

export class KioskPunchDto {
  @IsUUID('4')
  employeeId!: string;

  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'A PIN must be 4 to 8 digits.' })
  @MaxLength(8)
  pin!: string;

  /// The closing checklist, on the second call of a clock-out that has one.
  @IsOptional()
  @ValidateNested()
  @Type(() => ClosingSubmissionDto)
  closing?: ClosingSubmissionDto;
}

export class SetKioskPinDto {
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'A PIN must be 4 to 8 digits.' })
  pin!: string;
}
