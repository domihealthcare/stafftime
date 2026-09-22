import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'That does not look like an email address.' })
  email!: string;
}

export class CompletePasswordResetDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  newPassword!: string;
}
