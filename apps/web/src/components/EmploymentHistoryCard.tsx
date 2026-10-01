import { useState } from 'react';
import { formatCalendarDate, localDate } from '../lib/format';
import { ApiError, api } from '../lib/api';
import type {
  EmploymentChange,
  EmploymentChangeInput,
  EmploymentChangeKind,
  PayRateUnit,
  StaffRecord,
} from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Badge, Card, Field, buttonClass, inputClass } from './ui';

export const CHANGE_KIND_LABELS: Record<EmploymentChangeKind, string> = {
  HIRED: 'Started',
  PROMOTION: 'Promotion',
  PAY_CHANGE: 'Pay change',
  POSITION_CHANGE: 'New position',
  OTHER: 'Other',
};

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/// "$24.50 an hour", "$52,000.00 a year".
export function formatPay(rate: number, unit: PayRateUnit): string {
  return `${DOLLARS.format(rate)} ${unit === 'HOURLY' ? 'an hour' : 'a year'}`;
}

/**
 * Pay and position over time, on a staff profile (October 2026, Dominguez):
 * every raise and promotion with the day it took effect. Admins only, like
 * the rest of the profile. A record — ADP pays people, and the payroll export
 * never reads this.
 */
export function EmploymentHistoryCard({
  employeeId,
  record,
  hireDate,
  onChanged,
}: {
  employeeId: string;
  record: StaffRecord;
  hireDate: string | null;
  onChanged: (record: StaffRecord) => void;
}) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function remove(change: EmploymentChange) {
    const sure = await confirm({
      title: `Remove this ${CHANGE_KIND_LABELS[change.kind].toLowerCase()}?`,
      body: `The ${formatCalendarDate(change.effectiveOn)} entry comes off their history for good. Nothing else changes — ADP is not affected.`,
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      onChanged(await api.removeEmploymentChange(change.id));
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove that.');
    }
  }

  return (
    <Card className="p-4" testId="employment-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Pay and position</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className={buttonClass('secondary', 'sm')}
          >
            + Add a change
          </button>
        )}
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs font-medium text-slate-600">Position now</dt>
          <dd className="mt-0.5 text-sm text-slate-900" data-testid="current-position">
            {record.current.position ? (
              <>
                <span className="font-semibold">{record.current.position.value}</span>
                <span className="block text-xs text-slate-600">
                  since {formatCalendarDate(record.current.position.since)}
                </span>
              </>
            ) : (
              <span className="text-slate-600">Not recorded</span>
            )}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs font-medium text-slate-600">Pay now</dt>
          <dd className="mt-0.5 text-sm text-slate-900" data-testid="current-pay">
            {record.current.pay ? (
              <>
                <span className="font-semibold">
                  {formatPay(record.current.pay.rate, record.current.pay.unit)}
                </span>
                <span className="block text-xs text-slate-600">
                  since {formatCalendarDate(record.current.pay.since)}
                </span>
              </>
            ) : (
              <span className="text-slate-600">Not recorded</span>
            )}
          </dd>
        </div>
      </dl>

      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}

      {adding && (
        <div className="mt-4">
          <ChangeForm
            initial={{
              effectiveOn:
                record.changes.length === 0 && hireDate
                  ? hireDate.slice(0, 10)
                  : localDate(new Date()),
              kind: record.changes.length === 0 ? 'HIRED' : 'PAY_CHANGE',
              position: null,
              payRate: null,
              payUnit: record.current.pay?.unit ?? 'HOURLY',
              note: null,
            }}
            submitLabel="Add it"
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              onChanged(await api.addEmploymentChange(employeeId, input));
              setAdding(false);
            }}
          />
        </div>
      )}

      {record.changes.length === 0 ? (
        !adding && (
          <p className="mt-4 text-sm text-slate-600">
            No history yet. Add where they started — their first position and pay — then each raise
            or promotion with the day it took effect.
          </p>
        )
      ) : (
        <ol className="mt-4 space-y-3" aria-label="Pay and position history">
          {record.changes.map((change) =>
            editingId === change.id ? (
              <li key={change.id}>
                <ChangeForm
                  initial={change}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSave={async (input) => {
                    onChanged(await api.updateEmploymentChange(change.id, input));
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={change.id}
                className="rounded-lg border border-slate-200 p-3"
                data-testid="employment-change"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900">
                        {formatCalendarDate(change.effectiveOn)}
                      </span>
                      <Badge tone={change.kind === 'PROMOTION' ? 'success' : 'neutral'}>
                        {CHANGE_KIND_LABELS[change.kind]}
                      </Badge>
                    </p>
                    {(change.position || change.payRate !== null) && (
                      <p className="mt-1 text-sm text-slate-700">
                        {[
                          change.position,
                          change.payRate !== null && change.payUnit
                            ? formatPay(change.payRate, change.payUnit)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {change.note && <p className="mt-1 text-sm text-slate-600">{change.note}</p>}
                    {change.recordedBy && (
                      <p className="mt-1 text-xs text-slate-500">Recorded by {change.recordedBy}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(change.id);
                        setAdding(false);
                      }}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(change)}
                      className={buttonClass('secondary', 'sm')}
                      aria-label={`Remove the ${formatCalendarDate(change.effectiveOn)} ${CHANGE_KIND_LABELS[change.kind].toLowerCase()}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </Card>
  );
}

function ChangeForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: EmploymentChangeInput;
  submitLabel: string;
  onSave: (input: EmploymentChangeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [effectiveOn, setEffectiveOn] = useState(initial.effectiveOn);
  const [kind, setKind] = useState<EmploymentChangeKind>(initial.kind);
  const [position, setPosition] = useState(initial.position ?? '');
  const [payRate, setPayRate] = useState(initial.payRate === null ? '' : String(initial.payRate));
  const [payUnit, setPayUnit] = useState<PayRateUnit>(initial.payUnit ?? 'HOURLY');
  const [note, setNote] = useState(initial.note ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const rate = payRate.trim() === '' ? null : Number(payRate.replace(/[$,\s]/g, ''));
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      setProblem('Pay is an amount in dollars, like 24.50.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSave({
        effectiveOn,
        kind,
        position: position.trim() || null,
        payRate: rate === null ? null : Math.round(rate * 100) / 100,
        payUnit: rate === null ? null : payUnit,
        note: note.trim() || null,
      });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      aria-label="Pay or position change"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What changed">
          {(props) => (
            <select
              {...props}
              value={kind}
              onChange={(event) => setKind(event.target.value as EmploymentChangeKind)}
              className={inputClass}
            >
              {Object.entries(CHANGE_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Took effect on">
          {(props) => (
            <input
              {...props}
              type="date"
              required
              value={effectiveOn}
              onChange={(event) => setEffectiveOn(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      </div>
      <Field label="Position" hint="Their job title, if it changed — e.g. Lead Medical Assistant.">
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={100}
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pay" hint="In dollars, if it changed. Leave blank otherwise.">
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              placeholder="24.50"
              value={payRate}
              onChange={(event) => setPayRate(event.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Per">
          {(props) => (
            <select
              {...props}
              value={payUnit}
              onChange={(event) => setPayUnit(event.target.value as PayRateUnit)}
              className={inputClass}
            >
              <option value="HOURLY">Hour</option>
              <option value="YEARLY">Year</option>
            </select>
          )}
        </Field>
      </div>
      <Field label="Comment (optional)">
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      {problem && <Alert>{problem}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
