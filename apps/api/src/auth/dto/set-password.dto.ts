import { IsString, MaxLength, MinLength } from 'class-validator';

/// An administrator issuing a temporary password for someone else.
export class SetPasswordDto {
  @IsString()
  @MinLength(12, { message: 'Use at least 12 characters.' })
  @MaxLength(200)
  temporaryPassword!: string;
}
