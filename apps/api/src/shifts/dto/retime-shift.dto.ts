import { IsIn, IsString, Matches } from 'class-validator';

/// Which shifts a change of hours reaches.
export const RETIME_SCOPES = ['ONE', 'SAME_WEEKDAY', 'LATER'] as const;
export type RetimeScope = (typeof RETIME_SCOPES)[number];

/// "Gaby is 7 to 2, from Wednesday it is 1 to 8" — new hours for a shift,
/// and for this shift only, for the same weekday from here on, or for every
/// later shift of theirs at those hours.
export class RetimeShiftDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM, e.g. 13:00' })
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM, e.g. 20:00' })
  endTime!: string;

  @IsIn(RETIME_SCOPES)
  scope!: RetimeScope;
}
