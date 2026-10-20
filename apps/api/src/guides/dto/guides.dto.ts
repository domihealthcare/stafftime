import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/// A guide section, made or changed; sent whole.
export class GuideSectionInput {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  group!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;
}

export class GuideMoveInput {
  @IsIn([-1, 1])
  by!: -1 | 1;
}
