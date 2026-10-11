import { formatBirthday } from '../lib/birthday';
import { formatTime } from '../lib/format';
import { getLanguage, locale, t as translate, useT } from '../lib/i18n';
import type { DirectoryEntry, OfficeExtension } from '../lib/types';
import { HoverNote } from './HoverNote';
import { Badge } from './ui';

/// Where somebody is right now, as the Directory says it: in now (and since
/// when, for managers — the server leaves it out for everybody else), working
/// from home today, on leave. Shared with the Staff screen so the two cannot
/// say different things about the same person.
export function PresenceBadges({
  entry,
}: {
  entry: Pick<DirectoryEntry, 'onNow' | 'homeToday' | 'onLeave'>;
}) {
  const t = useT();
  return (
    <>
      {entry.onNow && (
        <Badge tone="success">
          {t('In now · {place}', {
            place: entry.onNow.remote ? t('Working from home') : entry.onNow.location.name,
          })}
          {entry.onNow.since && t(' since {time}', { time: formatTime(entry.onNow.since) })}
        </Badge>
      )}
      {entry.homeToday && !entry.onNow?.remote && (
        <Badge tone="info">
          <HoverNote note={homeHours(entry.homeToday)} testId="home-today-badge">
            {t('Working from home today')}
          </HoverNote>
        </Badge>
      )}
      {entry.onLeave && <Badge tone="warning">{t('On leave')}</Badge>}
    </>
  );
}

/// A work-from-home shift's hours, for a hover note.
export function homeHours(shift: { startsAt: string; endsAt: string }): string {
  return translate('Working from home {from}–{to}', {
    from: formatTime(shift.startsAt),
    to: formatTime(shift.endsAt),
  });
}

/// Email and phone that open the mail app and the dialler, and the birthday —
/// month and day only. As on a Directory card.
export function ContactLines({
  person,
  extension,
  fromHomeToday = false,
}: {
  person: {
    email: string;
    phone?: string | null;
    birthdayMonth?: number | null;
    birthdayDay?: number | null;
  };
  /// Their line on the office extensions list, if they have one.
  extension?: OfficeExtension | null;
  /// Working from home today: their from-home number is the one to dial.
  fromHomeToday?: boolean;
}) {
  const t = useT();
  const birthday = birthdayLabel(person.birthdayMonth ?? null, person.birthdayDay ?? null);
  return (
    <div className="mt-2 flex flex-col gap-0.5 text-sm">
      {extension && (
        <span className="text-slate-700" data-testid="person-extension">
          <span aria-hidden="true">☎</span>{' '}
          {fromHomeToday && extension.homeExtension ? (
            <>
              <strong className="tabular-nums">
                {t('Ext. {number}', { number: extension.homeExtension })}
              </strong>
              {t(' today — they are working from home')}
              <span className="text-slate-500">
                {t(' (office {number})', { number: extension.extension })}
              </span>
            </>
          ) : (
            <>
              <span className="tabular-nums">
                {t('Ext. {number}', { number: extension.extension })}
              </span>
              {extension.homeExtension && (
                <span className="text-slate-500">
                  {' '}
                  {t('· {number} from home', { number: extension.homeExtension })}
                  {extension.homeDays && ` (${extension.homeDays})`}
                </span>
              )}
            </>
          )}
        </span>
      )}
      <a
        href={`mailto:${person.email}`}
        className="tap truncate text-brand-700 hover:text-brand-900"
      >
        {person.email}
      </a>
      {person.phone && (
        <a
          href={`tel:${person.phone.replace(/[^\d+]/g, '')}`}
          className="tap text-brand-700 hover:text-brand-900"
        >
          {person.phone}
        </a>
      )}
      {birthday && (
        <span className="text-slate-600" data-testid="directory-birthday">
          <span aria-hidden="true">🎂</span> {t('Birthday {date}', { date: birthday })}
        </span>
      )}
    </div>
  );
}

/// "Nov 9" in English, as everywhere else; the month in Spanish ("9 nov") for
/// somebody reading in Spanish.
function birthdayLabel(month: number | null, day: number | null): string | null {
  if (getLanguage() !== 'es' || !month || !day) return formatBirthday(month, day);
  return new Date(2000, month - 1, day).toLocaleDateString(locale(), {
    month: 'short',
    day: 'numeric',
  });
}
