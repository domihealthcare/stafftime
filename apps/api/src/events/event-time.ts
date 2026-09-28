import {
  addDaysTo,
  localDateIn,
  PRACTICE_ZONE,
  zonedTimeToUtc,
} from '../common/util/zoned-time.util';

/// The instants an all-day event runs between: midnight in New Jersey on its
/// first day, to midnight after its last.
export function allDayRange(startDate: string, endDate: string) {
  return {
    startsAt: zonedTimeToUtc(startDate, '00:00', PRACTICE_ZONE),
    endsAt: zonedTimeToUtc(addDaysTo(endDate, 1), '00:00', PRACTICE_ZONE),
  };
}

/// The inclusive first and last day of an all-day event, "2026-10-15".
export function allDayDates(event: { startsAt: Date; endsAt: Date }) {
  return {
    startDate: localDateIn(event.startsAt, PRACTICE_ZONE),
    // The end is the midnight after the last day, so step back off it.
    endDate: localDateIn(new Date(event.endsAt.getTime() - 1), PRACTICE_ZONE),
  };
}

/**
 * When an event is, in words, on the practice's clock — for a notification.
 *
 * "Wed, Oct 15" · "Wed, Oct 15 – Fri, Oct 17" ·
 * "Tue, Oct 14, 12:30 PM–1:30 PM" · "Fri, Oct 17, 6:00 PM – Sat, Oct 18, 1:00 AM"
 */
export function describeWhen(event: { allDay: boolean; startsAt: Date; endsAt: Date }): string {
  const day = (at: Date) =>
    at.toLocaleDateString('en-US', {
      timeZone: PRACTICE_ZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  const time = (at: Date) =>
    at.toLocaleTimeString('en-US', {
      timeZone: PRACTICE_ZONE,
      hour: 'numeric',
      minute: '2-digit',
    });

  if (event.allDay) {
    const { startDate, endDate } = allDayDates(event);
    // Noon UTC on a date is that same date in New Jersey, whatever the season.
    const first = day(new Date(`${startDate}T12:00:00Z`));
    return startDate === endDate ? first : `${first} – ${day(new Date(`${endDate}T12:00:00Z`))}`;
  }
  const sameDay =
    localDateIn(event.startsAt, PRACTICE_ZONE) === localDateIn(event.endsAt, PRACTICE_ZONE);
  return sameDay
    ? `${day(event.startsAt)}, ${time(event.startsAt)}–${time(event.endsAt)}`
    : `${day(event.startsAt)}, ${time(event.startsAt)} – ${day(event.endsAt)}, ${time(event.endsAt)}`;
}
