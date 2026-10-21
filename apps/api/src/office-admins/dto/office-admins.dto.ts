import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OfficeAdminInput {
  @IsUUID()
  locationId!: string;

  /// 1 = Monday … 7 = Sunday.
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsUUID()
  employeeId!: string;
}

/// The whole usual pattern, every office, saved at once.
export class OfficeAdminPatternInput {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OfficeAdminInput)
  entries!: OfficeAdminInput[];
}

/// One day changed: somebody else, or nobody (`employeeId` null).
export class OfficeAdminDayInput {
  @IsOptional()
  @IsUUID()
  employeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
