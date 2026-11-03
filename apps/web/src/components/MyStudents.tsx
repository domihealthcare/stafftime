import { Link } from 'react-router';
import { addCalendarDays } from '../lib/dates';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { bareTime, describeStudent } from '../lib/practice-events';
import { officeShort } from '../lib/calendar-kinds';
import { practiceDate } from '../lib/practice-time';
import { useSession } from '../lib/session';
import { useRotations } from '../lib/student-rotations';
import { Card } from './ui';

/// How far ahead Home looks.
const DAYS_AHEAD = 14;
/// How many dates it lists at most.
const SHOWN = 5;

/**
 * The students and residents with you, on a provider's Home (November 2026,
 * Dominguez): today and the next two weeks, from the practice calendar.
 * Nothing for somebody with none. Fails quietly, like every Home card.
 */
export function MyStudents() {
  const t = useT();
  const { employee } = useSession();
  const rotations = useRotations(DAYS_AHEAD);
  const mine = (rotations ?? []).filter((rotation) => rotation.provider?.id === employee?.id);
  if (!employee || mine.length === 0) return null;

  const today = practiceDate();
  const tomorrow = addCalendarDays(today, 1);
  const when = (iso: string) => {
    const date = practiceDate(new Date(iso));
    return date === today
      ? t('Today')
      : date === tomorrow
        ? t('Tomorrow')
        : formatCalendarDate(date, { year: false });
  };
  return (
    <Card className="p-4" testId="home-students">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          <span aria-hidden="true">🎓</span> {t('Students with you')}
        </h2>
        <Link
          to="/schedule/calendar"
          className="text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          {t('Calendar →')}
        </Link>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
        {mine.slice(0, SHOWN).map((rotation) => (
          <li key={rotation.id}>
            <strong>{when(rotation.startsAt)}</strong>
            {' · '}
            {bareTime(rotation)}
            {rotation.atLocation && ` · ${officeShort(rotation.atLocation.name)}`}
            <span className="block text-slate-700">
              {rotation.title}
              {rotation.student && (
                <span className="text-slate-500"> ({describeStudent(rotation.student)})</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {mine.length > SHOWN && (
        <p className="mt-1 text-xs text-slate-500">
          {t('and {n} more in the next two weeks', { n: mine.length - SHOWN })}
        </p>
      )}
    </Card>
  );
}
