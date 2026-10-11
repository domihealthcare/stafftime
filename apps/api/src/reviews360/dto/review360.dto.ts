import { SurveyQuestionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class Review360QuestionDto {
  @IsEnum(SurveyQuestionKind)
  kind!: SurveyQuestionKind;

  @IsString()
  @MaxLength(200)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  selfPrompt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  hint?: string | null;
}

export class Review360Dto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intro?: string | null;

  /// The day it closes by itself, "2026-10-31". Optional.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'closesOn must be a date like 2026-10-31' })
  closesOn?: string | null;

  /// Left out: the starter set.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => Review360QuestionDto)
  questions?: Review360QuestionDto[];
}

export class Review360AnswerItemDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsInt()
  rating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string | null;
}

export class Review360AnswerDto {
  @IsUUID()
  subjectId!: string;

  /// "I don't work with them enough."
  @IsOptional()
  @IsBoolean()
  skip?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => Review360AnswerItemDto)
  answers?: Review360AnswerItemDto[];
}

export class MeetingSlotDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}

export class MeetingOfferDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => MeetingSlotDto)
  slots!: MeetingSlotDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  createMeetLink?: boolean;
}

export class ChooseSlotDto {
  @IsUUID()
  slotId!: string;
}
