import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { addDays } from '../lib/schedule-reviews';
import { useSession } from '../lib/session';
import { Card } from './ui';

const DAYS_AHEAD = 6;
const SHOWN = 3;

/**
 * The days you are the admin in an office, on Home (October 2026, Dominguez:
 * "we need to have an admin in WNY location daily except Friday"): today and
 * the next few. Nothing for somebody who is never one. Fails quietly.
 */
export function MyOfficeAdminDays() {
  const t = useT();
  const { employee } = useSession();
  const me = employee?.id ?? null;
  const [days, setDays] = useState<{ date: string; offices: string[] }[]>([]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const today = practiceDate();
    api
      .officeAdmins(today, addDays(today, DAYS_AHEAD))
      .then((found) => {
        if (cancelled) return;
        const names = new Map(found.offices.map((office) => [office.id, office.name]));
        setDays(
          found.days
            .map((day) => ({
              date: day.date,
              offices: day.admins
                .filter((admin) => admin.person?.id === me)
                .map((admin) => names.get(admin.locationId) ?? ''),
            }))
            .filter((day) => day.offices.length > 0)
            .slice(0, SHOWN),
        );
      })
      .catch(() => !cancelled && setDays([]));
    return () => {
      cancelled = true;
    };
  }, [me]);

  if (days.length === 0) return null;
  const today = practiceDate();
  const tomorrow = addDays(today, 1);
  const when = (date: string) =>
    date === today
      ? t('Today')
      : date === tomorrow
        ? t('Tomorrow')
        : formatCalendarDate(date, { year: false });
  return (
    <Card className="p-4" testId="home-office-admin">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('You are the office admin')}</h2>
        <Link
          to="/schedule-reviews"
          className="text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          {t('See the week →')}
        </Link>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-slate-800">
        {days.map((day) => (
          <li key={day.date}>
            <strong>{when(day.date)}</strong>
            {' · '}
            {day.offices.join(', ')}
          </li>
        ))}
      </ul>
    </Card>
  );
}
