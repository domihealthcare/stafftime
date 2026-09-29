import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import {
  displayName,
  formatCalendarDate,
  localDate,
  WEEK_ORDER,
  WEEKDAY_NAMES,
} from '../lib/format';
import type { StandingShift } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card } from './ui';

/// "Mondays and Thursdays", Sunday first as the calendar reads.
function whichDays(days: number[]): string {
  const names = WEEK_ORDER.filter((day) => days.includes(day)).map(
    (day) => `${WEEKDAY_NAMES[day - 1]}s`,
  );
  if (names.length === 7) return 'Every day';
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/// "08:30" → "8:30 AM".
function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * The regular shifts with no end date — "Rosa, every Monday, 8 to 4" — and
 * the one thing to do with them: stop them (asked for by Dominguez,
 * September 2026). Each keeps the rota filled eight weeks ahead, every night,
 * until then. Managers and admins only.
 */
export function StandingShiftsCard({
  version,
  onChanged,
}: {
  /// Bumped when a repeat is made elsewhere on the page, to re-fetch.
  version: number;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [standing, setStanding] = useState<StandingShift[] | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [lastDate, setLastDate] = useState(() => localDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .standingShifts()
      .then(setStanding)
      .catch(() => setStanding([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const who = (item: StandingShift) =>
    item.employee
      ? displayName(item.employee)
      : `Open shift${item.openCount > 1 ? ` ×${item.openCount}` : ''}${item.jobRole ? ` — ${item.jobRole.name}` : ''}`;

  async function stop(item: StandingShift) {
    const sure = await confirm({
      title: `Stop ${who(item)}’s regular shift?`,
      body: (
        <p>
          {whichDays(item.daysOfWeek)}, {clock(item.startTime)}–{clock(item.endTime)} at{' '}
          {item.location.name}. The last one is on or before{' '}
          {formatCalendarDate(lastDate, { year: false })}; the shifts after that come off the rota
          {item.employee ? ', and they are told' : ''}. Shifts already worked stay.
        </p>
      ),
      confirmLabel: 'Yes, stop it',
      cancelLabel: 'Keep it going',
    });
    if (!sure) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.stopStandingShift(item.id, lastDate);
      setResult(
        `Stopped after ${formatCalendarDate(done.lastDate, { year: false })}. ${done.removed} ${
          done.removed === 1 ? 'shift' : 'shifts'
        } taken off the rota.`,
      );
      setStopping(null);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop it.');
    } finally {
      setBusy(false);
    }
  }

  const running = (standing ?? []).filter((item) => !item.endsOn);
  const ending = (standing ?? []).filter((item) => item.endsOn);

  return (
    <Card className="p-4" testId="standing-shifts-card">
      <h2 className="text-sm font-semibold text-slate-900">
        <span aria-hidden="true">🔁</span> Regular shifts
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Repeating shifts with no end date. Each keeps the rota filled eight weeks ahead until it is
        stopped. Make one with <span className="font-medium">Repeating shifts</span> → No end date.
      </p>

      {standing === null ? null : standing.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {[...running, ...ending].map((item) => (
            <li key={item.id} className="py-2 text-sm" data-testid="standing-shift">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-slate-900">{who(item)}</span>
                <span className="text-slate-600">
                  {whichDays(item.daysOfWeek)}, {clock(item.startTime)}–{clock(item.endTime)} ·{' '}
                  {item.location.name}
                  {item.isRemote ? ' · from home' : ''}
                  {item.status === 'DRAFT' ? ' · as drafts' : ''}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Since {formatCalendarDate(item.startsOn, { year: false })}
                  {item.endsOn
                    ? ` · ends ${formatCalendarDate(item.endsOn, { year: false })}`
                    : ' · no end date'}
                </span>
                {!item.endsOn && stopping !== item.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setStopping(item.id);
                      setLastDate(localDate(new Date()));
                      setResult(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Stop…
                  </button>
                )}
              </div>
              {stopping === item.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
                  <label className="text-sm text-slate-700">
                    <span className="block text-xs font-medium">Last day it runs</span>
                    <input
                      type="date"
                      value={lastDate}
                      onChange={(event) => setLastDate(event.target.value)}
                      className="mt-0.5 rounded-lg border-slate-300 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !lastDate}
                    onClick={() => void stop(item)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {busy ? 'Stopping…' : 'Stop it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopping(null)}
                    className="px-2 py-1.5 text-sm text-slate-600 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {result && (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {result}
        </p>
      )}
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
