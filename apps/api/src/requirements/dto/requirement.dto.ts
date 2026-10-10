import { RequirementKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InviteesInput } from '../../events/dto/event.dto';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// Setting, or changing, something people must read or do. A change sends
/// the whole thing again, so what is saved is what the form showed.
export class RequirementInput {
  @IsEnum(RequirementKind)
  kind!: RequirementKind;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  /// A training video, a Drive document. https only — checked in the service.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsUUID()
  announcementId?: string | null;

  @IsOptional()
  @IsUUID()
  resourceId?: string | null;

  /// "YYYY-MM-DD", or absent for no due date.
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Give the due date as a date.' })
  dueOn?: string | null;

  @IsBoolean()
  everyone!: boolean;

  /// When not everyone: any mix of people, job roles and offices.
  @IsOptional()
  @ValidateNested()
  @Type(() => InviteesInput)
  targets?: InviteesInput;
}
