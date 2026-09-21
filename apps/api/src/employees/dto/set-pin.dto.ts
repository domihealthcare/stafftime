import { IsString, Matches } from 'class-validator';

export class SetPinDto {
  /// Kiosk PIN. Stored hashed, never in plain text.
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'pin must be 4-8 digits' })
  pin!: string;
}
