import { IsString, MaxLength, MinLength } from 'class-validator';

/// An administrator issuing a temporary password for someone else.
export class SetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters, including a number.' })
  @MaxLength(200)
  temporaryPassword!: string;
}
