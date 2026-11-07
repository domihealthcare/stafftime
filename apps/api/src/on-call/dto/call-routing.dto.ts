import { CallMessageKey } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/// A time-range cover. Times are New Jersey wall-clock "YYYY-MM-DDTHH:MM".
export class OnCallCoverInput {
  @Matches(LOCAL_TIME, { message: 'Give the start as a date and time.' })
  startsAt!: string;

  @Matches(LOCAL_TIME, { message: 'Give the end as a date and time.' })
  endsAt!: string;

  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  backupEmployeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CallMessageInput {
  @IsIn(Object.values(CallMessageKey))
  key!: CallMessageKey;

  @IsString()
  @MaxLength(1500)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audioUrl?: string | null;
}

export class CallRoutingSettingsInput {
  @IsOptional()
  @IsUUID()
  defaultProviderId?: string | null;

  @IsString()
  @MaxLength(60)
  voiceEn!: string;

  @IsString()
  @MaxLength(60)
  voiceEs!: string;

  @IsInt()
  @Min(10)
  @Max(60)
  ringSeconds!: number;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CallMessageInput)
  messages!: CallMessageInput[];
}
