import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { addDays } from '../lib/schedule-reviews';
import { useSession } from '../lib/session';
import type { OnCallPerson } from '../lib/types';
import { Card } from './ui';

/// How far ahead Home looks.
const DAYS_AHEAD = 6;
/// How many days it lists at most.
const SHOWN = 3;

/**
 * The provider schedules you review, on Home (October 2026, Dominguez: "so
 * they are aware they are to review a certain schedule"): today and the next
 * few days you have one. Nothing for somebody who reviews none. Fails
 * quietly, like every Home card.
 */
export function MyScheduleReviews() {
  const t = useT();
  const { employee } = useSession();
  const me = employee?.id ?? null;
  const [groups, setGroups] = useState<string[]>([]);
  const [days, setDays] = useState<{ date: string; providers: OnCallPerson[] }[]>([]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const today = practiceDate();
    api
      .scheduleReviewAreas()
      .then((found) => {
        if (!cancelled)
          setGroups(
            found.areas.filter((area) => area.reviewer?.id === me).map((area) => area.name),
          );
      })
      .catch(() => !cancelled && setGroups([]));
    api
      .scheduleReviews(today, addDays(today, DAYS_AHEAD))
      .then((found) => {
        if (cancelled) return;
        const byId = new Map(found.providers.map((provider) => [provider.id, provider]));
        setDays(
          found.days
            .map((day) => ({
              date: day.date,
              providers: day.reviews
                .filter((review) => review.reviewer?.id === me)
                .map((review) => byId.get(review.providerId))
                .filter((provider): provider is OnCallPerson => !!provider),
            }))
            .filter((day) => day.providers.length > 0)
            .slice(0, SHOWN),
        );
      })
      .catch(() => !cancelled && setDays([]));
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (days.length === 0 && groups.length === 0) return null;
  const today = practiceDate();
  const tomorrow = addDays(today, 1);
  const when = (date: string) =>
    date === today
      ? t('Today')
      : date === tomorrow
        ? t('Tomorrow')
        : formatCalendarDate(date, { year: false });
  return (
    <Card className="p-4" testId="home-schedule-reviews">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('Schedules you review')}</h2>
        <Link
          to="/schedule-reviews"
          className="text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          {t('All reviews →')}
        </Link>
      </div>
      {groups.length > 0 && (
        <p className="mt-2 text-sm text-slate-800">
          <strong>{t('Always')}</strong>
          {' · '}
          {groups.join(', ')}
        </p>
      )}
      <ul className="mt-2 space-y-1 text-sm text-slate-800">
        {days.map((day) => (
          <li key={day.date}>
            <strong>{when(day.date)}</strong>
            {' · '}
            {day.providers.map((provider) => provider.name).join(', ')}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{t('Their patient schedules, in eCW.')}</p>
    </Card>
  );
}
