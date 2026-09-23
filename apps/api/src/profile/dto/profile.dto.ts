import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/// What somebody may change about themselves. Empty clears a field.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pronouns?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[\d\s()+.\-x]*$/i, {
    message: 'A phone number is digits, spaces and ( ) + - . only — for example (201) 555-0142.',
  })
  @MaxLength(25)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  about?: string;
}

export class UploadPhotoDto {
  /// The photo as a base64 JPEG, with or without a `data:image/jpeg;base64,`
  /// prefix. The browser has already cropped, shrunk and re-encoded it.
  @IsString()
  @MaxLength(300_000)
  image!: string;
}
