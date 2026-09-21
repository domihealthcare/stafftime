import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;

  // Deliberately not length-validated against the password policy: telling a
  // caller their guess was "too short" is feedback an attacker can use.
  @IsString()
  @MaxLength(200)
  password!: string;
}
