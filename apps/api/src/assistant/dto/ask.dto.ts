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

/// A Help topic the screen picked for the question ("how do I…?").
export class HelpTopicDto {
  @IsString()
  @MaxLength(300)
  question!: string;

  @IsString()
  @MaxLength(6000)
  answer!: string;
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

  /// Help topics likely to answer it, picked on the screen from the guides
  /// the person can read. The guide's own words; never stored.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => HelpTopicDto)
  help?: HelpTopicDto[];
}
