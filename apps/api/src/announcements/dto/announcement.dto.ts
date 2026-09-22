import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;

  /// Ignored for the first post, which is primary whatever is asked.
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body?: string;

  /// `true` moves the primary here. `false` on the primary itself is refused:
  /// there must always be one, so the way to change it is to pick another.
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
