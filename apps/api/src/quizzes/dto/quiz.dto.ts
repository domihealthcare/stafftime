import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_CHOICES, MAX_QUESTIONS, MIN_CHOICES } from '../quiz';

export class QuizQuestionInput {
  /// Kept when a question is changed, so what people missed still points at it.
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  prompt!: string;

  @IsArray()
  @ArrayMinSize(MIN_CHOICES)
  @ArrayMaxSize(MAX_CHOICES)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  choices!: string[];

  /// The right answer, by its place in `choices`.
  @IsInt()
  @Min(0)
  correct!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  explanation?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  jobRoleIds!: string[];

  @IsBoolean()
  forManagers!: boolean;
}

/// Writing a quiz, or changing it. The questions are sent whole, in order.
export class QuizInput {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intro?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  passPercent!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  studyHref?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one question.' })
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionInput)
  questions!: QuizQuestionInput[];
}

/// A go at it: each question's id with the place of the answer picked.
export class QuizAnswersInput {
  @IsObject()
  answers!: Record<string, number>;
}
