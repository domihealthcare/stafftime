import { TimeEntryStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class QueryTimeEntriesDto {
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(TimeEntryStatus)
  status?: TimeEntryStatus;
}

/// The entries on screen, for "Approve all with nothing flagged". The server
/// approves only those that really have nothing flagged (`clean-entry.ts`).
export class ApproveCleanDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}
