import { SurveyAudience, SurveyQuestionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class QuestionInput {
  @IsEnum(SurveyQuestionKind)
  kind!: SurveyQuestionKind;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  prompt!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options?: string[];
}

export class SurveyInput {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  intro?: string;

  @IsEnum(SurveyAudience)
  audience!: SurveyAudience;

  @IsOptional()
  @IsUUID()
  jobRoleId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionInput)
  questions!: QuestionInput[];
}

export class AnswerInput {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  choice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}

export class ResponseInput {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AnswerInput)
  answers!: AnswerInput[];
}

export class FeedbackInput {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message!: string;
}
