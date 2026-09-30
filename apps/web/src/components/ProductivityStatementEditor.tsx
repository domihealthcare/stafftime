import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import {
  figures,
  formatDifference,
  formatMoney,
  parseCount,
  parseMoney,
} from '../lib/productivity';
import type { ProductivityStatement } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert } from './ui';

interface Row {
  startDate: string;
  endDate: string;
  expected: string;
  counts: { label: string; count: string }[];
}

const INPUT = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';
const NUMBER = `${INPUT} text-right tabular-nums`;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Fill in a period: for each interval the number expected and the patients
 * seen (one box per kind of visit the plan counts), a multiplier, and a note.
 * The difference and the amount work themselves out as you type, by the same
 * sums the server uses when it saves.
 *
 * Nothing here is compulsory except the dates and the counts — leave the
 * expected boxes empty for a provider with no target, and the multiplier empty
 * for one with no money in it.
 */
export function ProductivityStatementEditor({
  statement,
  onSaved,
  onCancel,
}: {
  statement: ProductivityStatement;
  onSaved: (saved: ProductivityStatement) => void;
  onCancel: () => void;
}) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>(
    statement.intervals.map((interval) => ({
      startDate: interval.startDate,
      endDate: interval.endDate,
      expected: interval.expected === null ? '' : String(interval.expected),
      counts: interval.counts.map((count) => ({ label: count.label, count: String(count.count) })),
    })),
  );
  const [multiplier, setMultiplier] = useState(
    statement.multiplier === null ? '' : String(statement.multiplier),
  );
  const [paidOn, setPaidOn] = useState(statement.paidOn ?? '');
  const [note, setNote] = useState(statement.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = rows[0]?.counts.map((count) => count.label) ?? [];
  const single = labels.length <= 1;
  const parsedMultiplier = parseMoney(multiplier);

  // Empty boxes count as nothing; anything that is not a number is flagged.
  const expectedOf = (row: Row) => (row.expected.trim() === '' ? null : parseCount(row.expected));
  const countOf = (text: string) => (text.trim() === '' ? 0 : parseCount(text));
  const invalid =
    parsedMultiplier === undefined ||
    rows.some(
      (row) =>
        (row.expected.trim() !== '' && expectedOf(row) === null) ||
        row.counts.some((count) => countOf(count.count) === null) ||
        row.endDate < row.startDate ||
        !row.startDate ||
        !row.endDate,
    );

  const live = figures(
    rows.map((row) => ({
      expected: expectedOf(row),
      counts: row.counts.map((count) => countOf(count.count) ?? 0),
    })),
    parsedMultiplier ?? null,
  );

  function setRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  function setCount(index: number, label: string, count: string) {
    setRows((current) =>
      current.map((row, at) =>
        at === index
          ? { ...row, counts: row.counts.map((c) => (c.label === label ? { ...c, count } : c)) }
          : row,
      ),
    );
  }

  function addInterval() {
    setRows((current) => {
      const last = current[current.length - 1];
      const length =
        (Date.parse(`${last.endDate}T00:00:00Z`) - Date.parse(`${last.startDate}T00:00:00Z`)) /
          86_400_000 +
        1;
      const start = addDays(last.endDate, 1);
      return [
        ...current,
        {
          startDate: start,
          endDate: addDays(start, length - 1),
          expected: last.expected,
          counts: last.counts.map((count) => ({ label: count.label, count: '0' })),
        },
      ];
    });
  }

  async function removeInterval(index: number) {
    const ok = await confirm({
      title: 'Remove this interval?',
      body: 'Its expected number and the patients counted in it go too. The statement is not saved until you save it.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (ok) setRows((current) => current.filter((_, at) => at !== index));
  }

  async function save(publish: boolean) {
    if (invalid) return;
    if (statement.published && !publish) {
      const ok = await confirm({
        title: 'Change a published statement?',
        body: 'The provider can already read this one. They will see the change at once and be told it was updated.',
        confirmLabel: 'Yes, save the change',
        cancelLabel: 'Keep editing',
        tone: 'neutral',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      let saved = await api.saveProductivityStatement(statement.id, {
        intervals: rows.map((row) => ({
          startDate: row.startDate,
          endDate: row.endDate,
          expected: expectedOf(row),
          counts: row.counts.map((count) => ({
            label: count.label,
            count: countOf(count.count) ?? 0,
          })),
        })),
        multiplier: parsedMultiplier ?? null,
        paidOn: paidOn || null,
        note: note.trim() || null,
      });
      if (publish && !saved.published) {
        saved = await api.publishProductivityStatement(statement.id);
      }
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">
        {formatCalendarDate(rows[0].startDate)} –{' '}
        {formatCalendarDate(rows[rows.length - 1].endDate)}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Numbers only. Leave “Expected” empty if there is no target, and the multiplier empty if
        there is no money in it.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2 font-medium">From</th>
              <th className="px-2 py-1 font-medium">To</th>
              <th className="px-2 py-1 font-medium">Expected</th>
              {labels.map((label) => (
                <th key={label} className="px-2 py-1 font-medium">
                  {single ? 'Patients' : label}
                </th>
              ))}
              <th className="py-1 pl-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="align-top">
                <td className="py-1 pr-2">
                  <input
                    type="date"
                    aria-label={`Interval ${index + 1} from`}
                    value={row.startDate}
                    onChange={(event) => setRow(index, { startDate: event.target.value })}
                    className={INPUT}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="date"
                    aria-label={`Interval ${index + 1} to`}
                    value={row.endDate}
                    onChange={(event) => setRow(index, { endDate: event.target.value })}
                    className={INPUT}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    inputMode="numeric"
                    aria-label={`Interval ${index + 1} expected`}
                    value={row.expected}
                    onChange={(event) => setRow(index, { expected: event.target.value })}
                    className={NUMBER}
                  />
                </td>
                {row.counts.map((count) => (
                  <td key={count.label} className="px-2 py-1">
                    <input
                      inputMode="numeric"
                      aria-label={`Interval ${index + 1} ${single ? 'patients' : count.label}`}
                      value={count.count}
                      onChange={(event) => setCount(index, count.label, event.target.value)}
                      className={NUMBER}
                    />
                  </td>
                ))}
                <td className="py-1 pl-2">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void removeInterval(index)}
                      aria-label={`Remove interval ${index + 1}`}
                      className="rounded px-2 py-1.5 text-slate-500 hover:bg-slate-100 hover:text-rose-700"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addInterval}
        className="mt-1 text-sm font-medium text-brand-700 hover:underline"
      >
        + Add another interval
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Multiplier ($ per patient)</span>
          <input
            inputMode="decimal"
            aria-label="Multiplier"
            value={multiplier}
            onChange={(event) => setMultiplier(event.target.value)}
            placeholder="none"
            className={NUMBER}
          />
          {parsedMultiplier === undefined && (
            <span className="mt-1 block text-xs text-rose-700">
              Dollars and cents, like 50 or 12.35.
            </span>
          )}
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Paid on</span>
          <input
            type="date"
            aria-label="Paid on"
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="text-sm sm:col-span-3">
          <span className="mb-1 block font-medium text-slate-700">
            Note for the provider (optional)
          </span>
          <input
            aria-label="Note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Paid with 08.15.25"
            className={INPUT}
          />
          <span className="mt-1 block text-xs text-slate-500">
            The provider reads this. Never put a patient’s name or details in it.
          </span>
        </label>
      </div>

      <dl
        className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm"
        aria-label="Worked out"
      >
        {live.expected !== null && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Expected</dt>
            <dd className="text-lg font-semibold tabular-nums">{live.expected}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            {live.expected === null ? 'Patients' : 'Actual'}
          </dt>
          <dd className="text-lg font-semibold tabular-nums">{live.actual}</dd>
        </div>
        {live.difference !== null && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Difference</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatDifference(live.difference)}
            </dd>
          </div>
        )}
        {live.amountCents !== null && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Amount</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatMoney(live.amountCents)}</dd>
          </div>
        )}
        {live.amountCents !== null && statement.carriesBalance && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              To pay
              {statement.balance.carriedInCents !== 0 &&
                ` (after ${formatMoney(statement.balance.carriedInCents)} brought forward)`}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMoney(Math.max(statement.balance.carriedInCents + live.amountCents, 0))}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || invalid}
          onClick={() => void save(false)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {statement.published ? 'Save changes' : 'Save draft'}
        </button>
        {!statement.published && (
          <button
            type="button"
            disabled={busy || invalid}
            onClick={() => void save(true)}
            className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
          >
            Save and publish
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
