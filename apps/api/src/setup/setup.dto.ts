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
  @MinLength(8, { message: 'Use at least 8 characters, including a number.' })
  @MaxLength(200)
  password!: string;
}
