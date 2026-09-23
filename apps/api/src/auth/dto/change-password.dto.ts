import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters, including a number.' })
  @MaxLength(200)
  newPassword!: string;
}
