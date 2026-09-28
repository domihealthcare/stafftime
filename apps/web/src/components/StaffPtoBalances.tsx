import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { PtoAdjustment, PtoPolicy, StaffBalance } from '../lib/types';
import { Alert, Card, Spinner } from './ui';

/**
 * Everybody's time off this policy year, for managers and admins — and the
 * way to put in what the app never saw (Dominguez, September 2026): days
 * people had already taken before Domi Staff, and a yearly allowance of their
 * own for anybody not on the practice's.
 *
 * Closed until asked for: it works out a balance per person, which is not
 * worth doing every time somebody opens Time off to approve a request.
 */
export function StaffPtoBalances({
  policy,
  onChanged,
}: {
  policy: PtoPolicy;
  /// Something was saved — the manager's own balance may be among them.
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StaffBalance[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setProblem(null);
    try {
      setRows(await api.staffPtoBalances());
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not load the balances.');
    }
  }

  const needle = search.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (row) =>
      !needle ||
      `${row.employee.preferredName ?? ''} ${row.employee.firstName} ${row.employee.lastName}`
        .toLowerCase()
        .includes(needle),
  );

  return (
    <Card className="p-4" testId="staff-pto-balances">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Staff balances</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            What everybody has left, and time already taken before Domi Staff.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : void show())}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          {open ? 'Close' : 'Open'}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {problem && <Alert>{problem}</Alert>}
          {!rows && !problem && <Spinner label="Working out balances" />}
          {rows && (
            <>
              <label htmlFor="balance-search" className="sr-only">
                Find somebody
              </label>
              <input
                id="balance-search"
                type="search"
                placeholder="Find somebody"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="mb-3 w-full rounded-lg border-slate-300 py-2 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600 sm:text-sm"
              />
              <ul className="divide-y divide-slate-100">
                {visible.map((row) => (
                  <li key={row.employee.id} data-testid={`balance-${row.employee.email}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                      <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                        {row.employee.preferredName || row.employee.firstName}{' '}
                        {row.employee.lastName}
                      </span>
                      <Left label="PTO" days={row.balance.vacation.remaining} />
                      <Left label="Sick" days={row.balance.sick.remaining} />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing((current) =>
                            current === row.employee.id ? null : row.employee.id,
                          )
                        }
                        className="text-sm font-medium text-brand-700 hover:text-brand-800"
                      >
                        {editing === row.employee.id ? 'Close' : 'Adjust'}
                      </button>
                    </div>
                    {editing === row.employee.id && (
                      <AdjustForm
                        row={row}
                        policy={policy}
                        onSaved={(saved) => {
                          setRows((current) =>
                            (current ?? []).map((other) =>
                              other.employee.id === saved.employee.id ? saved : other,
                            ),
                          );
                          setEditing(null);
                          onChanged();
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {visible.length === 0 && (
                <p className="text-sm text-slate-500">Nobody by that name.</p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Left({ label, days }: { label: string; days: number }) {
  return (
    <span className={`text-sm tabular-nums ${days < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
      <span className="text-slate-500">{label}</span> {days} left
    </span>
  );
}

/// Blank is null: the practice's allowance, or a carry-over worked out.
const toNumber = (text: string) => (text.trim() === '' ? null : Number(text));
const toText = (value: number | null) => (value === null ? '' : String(value));

function AdjustForm({
  row,
  policy,
  onSaved,
  onCancel,
}: {
  row: StaffBalance;
  policy: PtoPolicy;
  onSaved: (saved: StaffBalance) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    vacationUsed: toText(row.vacationUsed || null),
    sickUsed: toText(row.sickUsed || null),
    vacationDaysPerYear: toText(row.vacationDaysPerYear),
    sickDaysPerYear: toText(row.sickDaysPerYear),
    vacationCarriedOver: toText(row.vacationCarriedOver),
    sickCarriedOver: toText(row.sickCarriedOver),
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = row.employee.preferredName || row.employee.firstName;
  const id = row.employee.id;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const body: PtoAdjustment = {
      vacationUsed: toNumber(form.vacationUsed) ?? 0,
      sickUsed: toNumber(form.sickUsed) ?? 0,
      vacationDaysPerYear: toNumber(form.vacationDaysPerYear),
      sickDaysPerYear: toNumber(form.sickDaysPerYear),
      vacationCarriedOver: toNumber(form.vacationCarriedOver),
      sickCarriedOver: toNumber(form.sickCarriedOver),
    };
    try {
      onSaved(await api.adjustPtoBalance(id, body));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form, label: string, hint: string, placeholder?: string) => (
    <div>
      <label htmlFor={`${key}-${id}`} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={`${key}-${id}`}
        type="number"
        inputMode="decimal"
        min={0}
        max={366}
        step={0.5}
        placeholder={placeholder}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        className="mt-1 w-full rounded-lg border-slate-300 py-2 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
      />
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="mb-3 rounded-lg bg-slate-50 p-3"
      aria-label={`Adjust ${name}’s time off`}
    >
      <p className="mb-3 text-sm text-slate-600">
        For the {row.balance.policyYear} policy year. Days, halves allowed.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          'vacationUsed',
          'PTO already taken',
          `Before Domi Staff, this year. Anything booked in the app counts by itself.`,
          '0',
        )}
        {field('sickUsed', 'Sick days already taken', 'Before Domi Staff, this year.', '0')}
        {field(
          'vacationDaysPerYear',
          'Their own PTO a year',
          `Leave blank for the practice’s ${policy.vacationDaysPerYear}.`,
          String(policy.vacationDaysPerYear),
        )}
        {field(
          'sickDaysPerYear',
          'Their own sick days a year',
          `Leave blank for the practice’s ${policy.sickDaysPerYear}.`,
          String(policy.sickDaysPerYear),
        )}
        {policy.maxCarryoverDays > 0 &&
          field(
            'vacationCarriedOver',
            'PTO carried over into this year',
            'Leave blank to let the app work it out.',
            String(row.balance.vacation.carriedOver),
          )}
        {policy.sickCarryoverDays > 0 &&
          field(
            'sickCarriedOver',
            'Sick days carried over into this year',
            'Leave blank to let the app work it out.',
            String(row.balance.sick.carriedOver),
          )}
      </div>
      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
