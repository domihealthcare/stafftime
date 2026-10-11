import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useT } from '../lib/i18n';
import type { Shift } from '../lib/types';

/// The choices, in minutes — the same as the server's.
const CHOICES = [10, 20, 30, 45, 60];
/// From this long before a shift starts until it ends.
const FROM_MINUTES_BEFORE = 180;

/**
 * "Running late?" on Home (October 2026, Dominguez — a "smarter" idea): for
 * today's shift, from three hours before it until it ends, while not clocked
 * in. One tap tells the managers of that office on the bell, and the
 * timesheet shows it beside the late flag. Saying it again changes the time.
 */
export function RunningLate({ shift }: { shift: Shift }) {
  const t = useT();
  const [said, setSaid] = useState(shift.runningLate?.minutes ?? null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const now = Date.now();
  const starts = new Date(shift.startsAt).getTime();
  if (now >= new Date(shift.endsAt).getTime() || starts - now > FROM_MINUTES_BEFORE * 60_000) {
    return null;
  }

  async function say(minutes: number) {
    setBusy(true);
    setProblem(null);
    try {
      const saved = await api.runningLate(shift.id, minutes);
      setSaid(saved.minutes);
      setChoosing(false);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : t('That did not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3" data-testid="running-late">
      {said !== null && !choosing ? (
        <p className="text-sm text-slate-700">
          {t('You told your managers: about {n} minutes late.', { n: String(said) })}{' '}
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="font-medium text-brand-700 hover:underline"
          >
            {t('Change')}
          </button>
        </p>
      ) : choosing ? (
        <div>
          <p className="text-sm font-medium text-slate-800">{t('About how late?')}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={busy}
                onClick={() => void say(minutes)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                {t('{n} min', { n: String(minutes) })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChoosing(false)}
            className="mt-2 text-sm text-slate-600 hover:text-slate-900"
          >
            {t('Cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          {t('Running late?')}
        </button>
      )}
      {problem && <p className="mt-1 text-sm text-rose-700">{problem}</p>}
    </div>
  );
}
