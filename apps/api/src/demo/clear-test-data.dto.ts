import { IsIn } from 'class-validator';

export class ClearTestDataDto {
  /// Spelled out so a stray request cannot clear anything.
  @IsIn(['clear-test-data'], { message: 'Confirm clearing the test data first.' })
  confirm!: string;
}
