import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/// Most choices a poll can offer, and how long each may be.
export const MAX_POLL_OPTIONS = 10;
export const MAX_COMMENT_LENGTH = 2_000;

/// A poll as the admin writes it with the post. Blank choices are dropped and
/// repeats refused by the service, which also checks two are left.
export class PollDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  question!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_POLL_OPTIONS)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options!: string[];

  /// Tick boxes rather than one choice.
  @IsOptional()
  @IsBoolean()
  allowsMultiple?: boolean;
}

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  /// May be empty when the post carries a poll — the question says it all.
  @IsString()
  @MaxLength(10_000)
  body!: string;

  /// Ignored for the first post, which is primary whatever is asked.
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  /// Also shown on the front-desk time clock, where patients can see it.
  @IsOptional()
  @IsBoolean()
  showOnTimeClock?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PollDto)
  poll?: PollDto;

  /// The post in Spanish (October 2026). Empty clears it; left out on an edit,
  /// it stays — unless the English changed, when it is cleared to be redone.
  @IsOptional()
  @IsString()
  @MaxLength(160)
  titleEs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  bodyEs?: string;

  /// The Spanish is the AI service's, as it came — shown to staff as such.
  @IsOptional()
  @IsBoolean()
  spanishByAi?: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  body?: string;

  /// `true` moves the primary here. `false` on the primary itself is refused:
  /// there must always be one, so the way to change it is to pick another.
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  /// Also shown on the front-desk time clock, where patients can see it.
  @IsOptional()
  @IsBoolean()
  showOnTimeClock?: boolean;

  /// Left out: the poll stays as it is. `null`: it is taken off. A poll: it
  /// replaces the old one — refused once anybody has voted, unless only the
  /// question's wording changed.
  @IsOptional()
  @ValidateNested()
  @Type(() => PollDto)
  poll?: PollDto | null;

  /// The post in Spanish (October 2026). Empty clears it; left out on an edit,
  /// it stays — unless the English changed, when it is cleared to be redone.
  @IsOptional()
  @IsString()
  @MaxLength(160)
  titleEs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  bodyEs?: string;

  /// The Spanish is the AI service's, as it came — shown to staff as such.
  @IsOptional()
  @IsBoolean()
  spanishByAi?: boolean;
}

export class CommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_COMMENT_LENGTH)
  body!: string;
}

export class VoteDto {
  /// Every choice the person picks, replacing what they picked before. Empty
  /// takes their vote back.
  @IsArray()
  @ArrayMaxSize(MAX_POLL_OPTIONS)
  @IsUUID('all', { each: true })
  optionIds!: string[];
}

export class PollStateDto {
  @IsBoolean()
  closed!: boolean;
}

/// "Help me write it": an admin's rough notes, and the title if there is one.
export class DraftPostDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  notes!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}

/// Words to put into Spanish, from the editor before they are saved.
export class TranslatePostDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(10_000)
  body!: string;
}
