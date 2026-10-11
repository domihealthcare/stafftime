import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { canSeeOnCall } from '../lib/on-call';
import { formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import type { OnCallSchedule } from '../lib/types';
import { Avatar } from './Avatar';
import { Card } from './ui';

/**
 * Who is on call now, on Home — for providers, managers and admins (October
 * 2026). Fails quietly, like every Home card.
 */
export function OnCallNow() {
  const t = useT();
  const { employee } = useSession();
  const allowed = canSeeOnCall(employee);
  const [now, setNow] = useState<OnCallSchedule['now'] | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const today = practiceDate();
    api
      .onCall(today, today)
      .then((found) => !cancelled && setNow(found.now))
      .catch(() => !cancelled && setNow(null));
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed || !now) return null;
  const mine = now.employee?.id === employee?.id;
  return (
    <Card className="p-4" testId="home-on-call">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('On call now')}</h2>
        <Link to="/on-call" className="text-sm font-medium text-brand-700 hover:text-brand-900">
          {t('Schedule →')}
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {now.employee && <Avatar person={now.employee} size="sm" />}
        <p className="text-sm text-slate-800">
          <strong>
            {now.employee ? (mine ? t('You') : now.employee.name) : t('Nobody is set')}
          </strong>
          <span className="text-slate-600">
            {' · '}
            {t('until {time}', { time: formatPracticeDateTime(now.until) })}
          </span>
        </p>
      </div>
    </Card>
  );
}
