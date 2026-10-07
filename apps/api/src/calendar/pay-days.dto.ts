import { Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class PayDaysQuery {
  /// First day, inclusive, "2026-11-01".
  @Matches(DATE_ONLY, { message: 'from must be a date like 2026-11-01' })
  from!: string;

  /// Last day, inclusive.
  @Matches(DATE_ONLY, { message: 'to must be a date like 2026-11-30' })
  to!: string;
}
