import { PtoType } from '@prisma/client';

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
