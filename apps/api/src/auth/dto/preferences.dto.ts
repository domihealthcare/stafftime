import { DigestTopic } from '@prisma/client';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdatePreferencesDto {
  /// Whether to receive the nightly round-up of what needs a look. Only
  /// managers and admins are ever sent it; an employee setting it changes
  /// nothing, which is simpler than pretending the field does not exist.
  @IsOptional()
  @IsBoolean()
  wantsDailyDigest?: boolean;

  /// The parts of the round-up to leave out (`email/digest-topics.ts`). The
  /// whole list, not a change to it.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(DigestTopic, { each: true })
  mutedDigestTopics?: DigestTopic[];
}
