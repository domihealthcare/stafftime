import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { displayName, formatCalendarDate } from '../lib/format';
import type { Employee, PersonName, RotaCost } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card, buttonClass, inputClass } from './ui';

/**
 * What the rota on screen costs (October 2026, Dominguez: "only for certain
 * individuals" — he, Kayla and Angelica to start with). Totals only — by
 * office and by day, never by person — so nobody's pay can be read off it.
 * Hourly pay for scheduled hours (overtime at time and a half) and salaries
 * for the days on screen; drafts included; no taxes or benefits.
 */

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function RotaCostCard({
  from,
  to,
  period,
  refreshKey,
}: {
  /// "YYYY-MM-DD", inclusive.
  from: string;
  to: string;
  /// "this week", "in October" — how the screen's range reads.
  period: string;
  /// Changes whenever the rota on screen does, so the cost follows it.
  refreshKey: string;
}) {
  const [cost, setCost] = useState<RotaCost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .rotaCost(from, to)
      .then((found) => {
        if (cancelled) return;
        setCost(found);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not work it out.');
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, refreshKey]);

  if (error) return <Alert tone="warning">The rota’s cost: {error}</Alert>;
  if (!cost) return null;
  const busiest = Math.max(...cost.byDay.map((day) => day.total), 1);
  return (
    <details
      className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-slate-200"
      data-testid="rota-cost"
    >
      <summary className="cursor-pointer">
        <span className="font-medium">Rota cost {period}:</span>{' '}
        <strong data-testid="rota-cost-total">{money(cost.total)}</strong>
        <span className="text-slate-600">
          {' '}
          ·{' '}
          {cost.byLocation
            .filter((office) => office.total > 0)
            .map((office) => `${office.name} ${money(office.total)}`)
            .join(' · ')}
        </span>
        {cost.missingPay.length > 0 && (
          <span className="text-amber-700"> · {cost.missingPay.length} with no pay on file</span>
        )}
      </summary>
      <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <dl className="space-y-1">
          <div className="flex justify-between gap-4">
            <dt>Hourly pay ({cost.scheduledHours} hours on the rota in all)</dt>
            <dd>{money(cost.hourly)}</dd>
          </div>
          {cost.overtimeHours > 0 && (
            <div className="flex justify-between gap-4 text-rose-700">
              <dt>… of which overtime extra ({cost.overtimeHours} hours at time and a half)</dt>
              <dd>{money(cost.overtimeExtra)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>Salaries, for these days</dt>
            <dd>{money(cost.salaried)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-100 pt-1 font-semibold">
            <dt>Total</dt>
            <dd>{money(cost.total)}</dd>
          </div>
        </dl>
        <ul className="space-y-0.5" aria-label="By day">
          {cost.byDay.map((day) => (
            <li key={day.date} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-slate-600">
                {formatCalendarDate(day.date, { year: false })}
              </span>
              <span
                className="h-2 rounded bg-brand-600"
                style={{ width: `${Math.round((day.total / busiest) * 100)}%`, maxWidth: '60%' }}
                aria-hidden="true"
              />
              <span>{money(day.total)}</span>
            </li>
          ))}
        </ul>
      </div>
      {cost.missingPay.length > 0 && (
        <p className="mt-3 text-amber-800">
          No pay on file, so not counted: {cost.missingPay.map((person) => person.name).join(', ')}.
          Add it under Pay and position on their staff profile.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Scheduled hours, drafts included, at each person’s pay on their staff profile; salaries as a
        year ÷ 52 a week. Not what was worked, and no taxes or benefits. Only the people an admin
        has chosen see this.
      </p>
    </details>
  );
}

/** Admins choose who sees the rota's cost — on Practice settings. */
export function RotaCostAccessCard() {
  const confirm = useConfirm();
  const [holders, setHolders] = useState<PersonName[] | null>(null);
  const [everyone, setEveryone] = useState<Employee[]>([]);
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.rotaCostAccess(), api.listEmployees()])
      .then(([list, people]) => {
        setHolders(list);
        setEveryone(
          people.filter(
            (p) => p.employmentStatus === 'ACTIVE' || p.employmentStatus === 'ON_LEAVE',
          ),
        );
      })
      .catch((cause: unknown) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not load that.'),
      );
  }, []);

  async function grant() {
    if (!chosen) return;
    try {
      setHolders(await api.grantRotaCostAccess(chosen));
      setChosen('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not do that.');
    }
  }

  async function revoke(person: PersonName) {
    const ok = await confirm({
      title: `Stop showing ${displayName(person)} the rota’s cost?`,
      body: 'It goes from their Schedule. Nothing else changes.',
      confirmLabel: 'Yes, stop',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setHolders(await api.revokeRotaCostAccess(person.id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not do that.');
    }
  }

  const without = everyone
    .filter((p) => !holders?.some((h) => h.id === p.id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  return (
    <Card className="p-4" testId="rota-cost-access">
      <h2 className="text-base font-semibold text-slate-900">Who sees the rota’s cost</h2>
      <p className="mt-1 text-sm text-slate-600">
        The people listed here see what the rota costs above it on the Schedule — totals by office
        and day, worked out from the pay on staff profiles. Nobody else does, admins included,
        unless they are on the list.
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100">
        {(holders ?? []).map((person) => (
          <li key={person.id} className="flex items-center justify-between py-2 text-sm">
            <span>{displayName(person)}</span>
            <button
              type="button"
              onClick={() => void revoke(person)}
              aria-label={`Stop showing ${displayName(person)} the rota’s cost`}
              className={buttonClass('secondary', 'sm')}
            >
              Remove
            </button>
          </li>
        ))}
        {holders?.length === 0 && <li className="py-2 text-sm text-slate-500">Nobody yet.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Show it to</span>
          <select
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            className={`${inputClass} w-64`}
          >
            <option value="">Choose somebody…</option>
            {without.map((person) => (
              <option key={person.id} value={person.id}>
                {displayName(person)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!chosen}
          onClick={() => void grant()}
          className={buttonClass('primary', 'md')}
        >
          Add
        </button>
      </div>
    </Card>
  );
}
