import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/// Asking to set up Face ID: the password, when the sign-in is not fresh.
export class PasskeyRegisterOptionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

/// What the browser answered, passed as it is to the WebAuthn library, which
/// checks every part of it.
export class PasskeyResponseDto {
  @IsObject()
  response!: Record<string, unknown>;
}
