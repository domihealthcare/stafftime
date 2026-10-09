import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  text!: string;
}

export class AskDto {
  @IsString()
  @MaxLength(2000)
  question!: string;

  /// The conversation on screen so far, newest last. Never stored.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TurnDto)
  history?: TurnDto[];
}
