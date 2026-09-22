import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class FirstRunSetupDto {
  /// The one-time token from the SETUP_TOKEN environment variable.
  @IsString()
  @Length(8, 200)
  setupToken!: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsString()
  @MinLength(12, { message: 'Use at least 12 characters. A short phrase works well.' })
  @MaxLength(200)
  password!: string;
}
