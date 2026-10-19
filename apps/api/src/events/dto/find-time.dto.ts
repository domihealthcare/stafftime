import { EventAudience, EventReplyAnswer } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InviteesInput } from './event.dto';

/// "Find a time": who it would be for, how long it lasts, and from when to look.
export class FindTimeInput {
  /// Everyone, or a chosen list - what the event form offers.
  @IsIn([EventAudience.EVERYONE, EventAudience.CHOSEN])
  audience!: EventAudience;

  @IsOptional()
  @ValidateNested()
  @Type(() => InviteesInput)
  invitees?: InviteesInput;

  /// The first day to look at, "2026-10-20". A day already gone counts from today.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a date like 2026-10-20' })
  from!: string;

  /// How many days to look at.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  days?: number;

  /// How long the meeting is.
  @IsInt()
  @Min(15)
  @Max(480)
  minutes!: number;

  /// The meeting being changed, so it is not in its own way.
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

/// Going, can't go or maybe.
export class ReplyInput {
  @IsEnum(EventReplyAnswer)
  answer!: EventReplyAnswer;
}
