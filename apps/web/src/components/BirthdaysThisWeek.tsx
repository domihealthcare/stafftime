import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { birthdayName } from '../lib/birthday';
import { localDate } from '../lib/format';
import type { BirthdayEntry } from '../lib/types';
import { Avatar } from './Avatar';
import { Card } from './ui';

function when(date: string): string {
  const today = localDate(new Date());
  const tomorrow = localDate(new Date(Date.now() + 86_400_000));
  if (date === today) return 'Today';
  if (date === tomorrow) return 'Tomorrow';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Colleagues' birthdays in the coming week, on the screen everybody opens —
 * asked for by Dominguez (September 2026) so people can wish each other a
 * happy birthday. Nothing is shown in a week without one.
 */
export function BirthdaysThisWeek() {
  const [entries, setEntries] = useState<BirthdayEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const from = localDate(new Date());
    const to = localDate(new Date(Date.now() + 6 * 86_400_000));
    api
      .birthdays(from, to)
      .then((found) => !cancelled && setEntries(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <Card className="p-4" testId="birthdays-this-week">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span aria-hidden="true">🎂</span> Birthdays this week
      </h2>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li key={`${entry.id}-${entry.date}`} className="flex items-center gap-3 text-sm">
            <Avatar person={entry} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-900">
                {birthdayName(entry)} {entry.lastName}
              </span>
              <span className="block text-xs text-slate-500">{when(entry.date)}</span>
            </span>
            {entry.date === localDate(new Date()) && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                Happy birthday!
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
