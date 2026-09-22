import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'Use at least 12 characters. A short phrase works well.' })
  @MaxLength(200)
  newPassword!: string;
}
