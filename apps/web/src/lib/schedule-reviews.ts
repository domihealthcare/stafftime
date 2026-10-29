import { useEffect, useState } from 'react';
import { api } from './api';
import { addCalendarDays } from './dates';
import { practiceDate } from './practice-time';
import type { ScheduleReview } from './types';

/**
 * Who reviews which provider's patient schedule (October 2026): the dates
 * the screens work in, and today's reviews by provider for the Directory and
 * Staff cards.
 */

/// The days a week shows, Sunday first like the rest of the app (1 = Monday
/// … 7 = Sunday).
export const WEEK_ORDER = [7, 1, 2, 3, 4, 5, 6];

export const WEEKDAY_NAMES = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/// The Sunday on or before a date.
export function sundayOf(date: string): string {
  return addCalendarDays(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
}

/// Today's reviewer for each provider, by provider id. Fails quietly: the
/// cards are whole without it.
export function useTodaysScheduleReviews(): Map<string, ScheduleReview> {
  const [reviews, setReviews] = useState<Map<string, ScheduleReview>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const today = practiceDate();
    api
      .scheduleReviews(today, today)
      .then((found) => {
        if (cancelled) return;
        setReviews(
          new Map((found.days[0]?.reviews ?? []).map((review) => [review.providerId, review])),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return reviews;
}
