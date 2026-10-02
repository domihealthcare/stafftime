import { formatBirthday } from '../lib/birthday';
import { formatTime } from '../lib/format';
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
  return (
    <>
      {entry.onNow && (
        <Badge tone="success">
          In now · {entry.onNow.remote ? 'Working from home' : entry.onNow.location.name}
          {entry.onNow.since && ` since ${formatTime(entry.onNow.since)}`}
        </Badge>
      )}
      {entry.homeToday && !entry.onNow?.remote && (
        <Badge tone="info">
          <HoverNote note={homeHours(entry.homeToday)} testId="home-today-badge">
            Working from home today
          </HoverNote>
        </Badge>
      )}
      {entry.onLeave && <Badge tone="warning">On leave</Badge>}
    </>
  );
}

/// A work-from-home shift's hours, for a hover note.
export function homeHours(shift: { startsAt: string; endsAt: string }): string {
  return `Working from home ${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}`;
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
  const birthday = formatBirthday(person.birthdayMonth ?? null, person.birthdayDay ?? null);
  return (
    <div className="mt-2 flex flex-col gap-0.5 text-sm">
      {extension && (
        <span className="text-slate-700" data-testid="person-extension">
          <span aria-hidden="true">☎</span>{' '}
          {fromHomeToday && extension.homeExtension ? (
            <>
              <strong className="tabular-nums">Ext. {extension.homeExtension}</strong> today — they
              are working from home
              <span className="text-slate-500"> (office {extension.extension})</span>
            </>
          ) : (
            <>
              <span className="tabular-nums">Ext. {extension.extension}</span>
              {extension.homeExtension && (
                <span className="text-slate-500">
                  {' '}
                  · {extension.homeExtension} from home
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
          <span aria-hidden="true">🎂</span> Birthday {birthday}
        </span>
      )}
    </div>
  );
}
