import { PtoType } from '@prisma/client';
import { PastBalanceSplit } from './past-balance-split';

/**
 * Time off in words, for the change history and the notices about it
 * (November 2026). The practice's own names: VACATION is "PTO".
 */
export const TIME_OFF_KIND: Record<PtoType, string> = {
  VACATION: 'PTO',
  SICK: 'Sick',
  PERSONAL: 'Personal',
  BEREAVEMENT: 'Bereavement',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
};

/// "PTO" for VACATION, "sick" for SICK: the balance a request draws on.
export function balanceName(type: PtoType): string {
  return type === PtoType.SICK ? 'sick' : 'PTO';
}

/// "Thu, Nov 5", "Thu, Nov 5 (half day)" or "Thu, Nov 5 to Fri, Nov 6".
export function describeDates(range: {
  startDate: Date;
  endDate: Date;
  isHalfDay: boolean;
}): string {
  const format = (date: Date) =>
    date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  if (range.startDate.getTime() === range.endDate.getTime()) {
    return range.isHalfDay ? `${format(range.startDate)} (half day)` : format(range.startDate);
  }
  return `${format(range.startDate)} to ${format(range.endDate)}`;
}

/// "1 day", "2.5 days".
export function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/// "Approved past the sick balance: 3 days Sick, Mon, Nov 2 to Wed, Nov 4;
/// 2 days Unpaid, Thu, Nov 5 to Fri, Nov 6". Across the turn of the year
/// there may be more stretches, each named in turn. `opening` is what comes
/// before "sick balance": "Approved past the", or "Split past the" for one
/// put right after it was approved.
export function describeSplit(
  request: { type: PtoType; startDate: Date; endDate: Date; isHalfDay: boolean },
  split: PastBalanceSplit,
  opening: string,
): string {
  const heading = `${opening} ${balanceName(request.type)} balance`;
  const stretches = split.segments.map(
    (segment) =>
      `${dayCount(segment.days)} ${segment.paid ? TIME_OFF_KIND[request.type] : 'Unpaid'}, ${describeDates(segment)}`,
  );
  return `${heading}: ${stretches.join('; ')}`;
}
