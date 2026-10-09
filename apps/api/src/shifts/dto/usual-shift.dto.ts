import { IsUUID, Matches } from 'class-validator';

/// "What does this person usually work on this day?" Asked by the shift forms
/// to start on their usual hours rather than 9 to 5.
export class UsualShiftDto {
  @IsUUID('4')
  employeeId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}
