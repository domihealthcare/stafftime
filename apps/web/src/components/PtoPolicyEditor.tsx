import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { PtoPolicy } from '../lib/types';
import { Alert, Card } from './ui';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// Admin-only editor for the practice's time-off rules. Everyone else sees the
/// same numbers read-only, because staff should be able to check what they are
/// entitled to without asking.
export function PtoPolicyEditor({
  policy,
  canEdit,
  onSaved,
}: {
  policy: PtoPolicy;
  canEdit: boolean;
  onSaved: (updated: PtoPolicy) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vacationDaysPerYear: String(policy.vacationDaysPerYear),
    sickDaysPerYear: String(policy.sickDaysPerYear),
    maxCarryoverDays: String(policy.maxCarryoverDays),
    sickCarryoverDays: String(policy.sickCarryoverDays),
    yearStartMonth: String(policy.yearStartMonth),
    yearStartDay: String(policy.yearStartDay),
    prorateFirstYear: policy.prorateFirstYear,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const updated = await api.updatePtoPolicy({
        vacationDaysPerYear: Number(form.vacationDaysPerYear),
        sickDaysPerYear: Number(form.sickDaysPerYear),
        maxCarryoverDays: Number(form.maxCarryoverDays),
        sickCarryoverDays: Number(form.sickCarryoverDays),
        yearStartMonth: Number(form.yearStartMonth),
        yearStartDay: Number(form.yearStartDay),
        prorateFirstYear: form.prorateFirstYear,
      });
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save the policy.');
    } finally {
      setBusy(false);
    }
  }

  const summary = `${policy.vacationDaysPerYear} days PTO · ${policy.sickDaysPerYear} sick days · ${
    policy.maxCarryoverDays > 0
      ? `${policy.maxCarryoverDays} days carried over`
      : 'nothing carried over'
  }`;

  const number =
    'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Practice policy</h2>
          <p className="mt-0.5 text-sm text-slate-600">{summary}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {open ? 'Close' : 'Change'}
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pto-days" className="block text-sm font-medium text-slate-700">
                PTO days a year
              </label>
              <input
                id="pto-days"
                type="number"
                min={0}
                max={365}
                value={form.vacationDaysPerYear}
                onChange={(e) => setForm({ ...form, vacationDaysPerYear: e.target.value })}
                className={number}
              />
              <p className="mt-1 text-xs text-slate-500">
                Vacation and personal days come out of this.
              </p>
            </div>

            <div>
              <label htmlFor="sick-days" className="block text-sm font-medium text-slate-700">
                Sick days a year
              </label>
              <input
                id="sick-days"
                type="number"
                min={0}
                max={365}
                value={form.sickDaysPerYear}
                onChange={(e) => setForm({ ...form, sickDaysPerYear: e.target.value })}
                className={number}
              />
              <p className="mt-1 text-xs text-slate-500">Tracked separately from PTO.</p>
            </div>

            <div>
              <label htmlFor="carryover" className="block text-sm font-medium text-slate-700">
                PTO days carried over
              </label>
              <input
                id="carryover"
                type="number"
                min={0}
                max={365}
                value={form.maxCarryoverDays}
                onChange={(e) => setForm({ ...form, maxCarryoverDays: e.target.value })}
                className={number}
              />
              <p className="mt-1 text-xs text-slate-500">
                Unused days that survive into next year, at most. 0 for none.
              </p>
            </div>

            <div>
              <label htmlFor="sick-carryover" className="block text-sm font-medium text-slate-700">
                Sick days carried over
              </label>
              <input
                id="sick-carryover"
                type="number"
                min={0}
                max={365}
                value={form.sickCarryoverDays}
                onChange={(e) => setForm({ ...form, sickCarryoverDays: e.target.value })}
                className={number}
              />
            </div>

            <div className="sm:col-span-2">
              <span className="block text-sm font-medium text-slate-700">
                The policy year starts
              </span>
              <div className="mt-1 flex gap-2">
                <select
                  aria-label="Policy year start month"
                  value={form.yearStartMonth}
                  onChange={(e) => setForm({ ...form, yearStartMonth: e.target.value })}
                  className="w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Policy year start day"
                  type="number"
                  min={1}
                  max={28}
                  value={form.yearStartDay}
                  onChange={(e) => setForm({ ...form, yearStartDay: e.target.value })}
                  className="w-24 rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                1 January unless Domi runs PTO on a different year.
              </p>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.prorateFirstYear}
              onChange={(e) => setForm({ ...form, prorateFirstYear: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              Prorate a new hire&rsquo;s first year
              <span className="block text-xs text-slate-500">
                Someone starting in July gets about half the year&rsquo;s days, not all of
                them.
              </span>
            </span>
          </label>

          {problem && (
            <div className="mt-3">
              <Alert>{problem}</Alert>
            </div>
          )}
          {saved && (
            <div className="mt-3">
              <Alert tone="success">
                Policy saved. Balances are recalculated from it immediately.
              </Alert>
            </div>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="mt-4 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save policy'}
          </button>
        </div>
      )}
    </Card>
  );
}
