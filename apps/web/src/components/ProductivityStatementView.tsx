import type { ReactNode } from 'react';
import { formatCalendarDate } from '../lib/format';
import { formatDifference, formatMoney } from '../lib/productivity';
import type { ProductivityStatement } from '../lib/types';
import { Badge, Card } from './ui';

/// One period's numbers, read-only: what a manager sees in their list and what
/// a provider sees of their own. Only the figures a statement actually has are
/// shown — with no target there is no "expected" or "difference", with no
/// multiplier no money — because the models differ from provider to provider.
export function ProductivityStatementView({
  statement,
  showStatus = false,
  actions,
}: {
  statement: Omit<ProductivityStatement, 'employee'>;
  /// Draft / Published, which only a manager has any use for.
  showStatus?: boolean;
  actions?: ReactNode;
}) {
  const { totals, intervals } = statement;
  const labels = [
    ...new Set(intervals.flatMap((interval) => interval.counts.map((count) => count.label))),
  ];
  const hasTarget = totals.expected !== null;
  const single = labels.length <= 1;

  const figures: { name: string; value: string; tone?: string }[] = [];
  if (hasTarget) figures.push({ name: 'Expected', value: String(totals.expected) });
  figures.push({ name: hasTarget ? 'Actual' : 'Patients', value: String(totals.actual) });
  if (totals.difference !== null) {
    figures.push({
      name: 'Difference',
      value: formatDifference(totals.difference),
      tone:
        totals.difference < 0 ? 'text-rose-700' : totals.difference > 0 ? 'text-emerald-700' : '',
    });
  }
  if (totals.multiplierCents !== null) {
    figures.push({ name: 'Multiplier', value: formatMoney(totals.multiplierCents) });
  }
  if (totals.amountCents !== null) {
    figures.push({
      name: 'Amount',
      value: formatMoney(totals.amountCents),
      tone: totals.amountCents < 0 ? 'text-rose-700' : '',
    });
  }

  return (
    <Card className="p-4" testId={`productivity-${statement.startDate}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {formatCalendarDate(statement.startDate)} – {formatCalendarDate(statement.endDate)}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {showStatus && (
              <Badge tone={statement.published ? 'success' : 'warning'}>
                {statement.published ? 'Published' : 'Draft'}
              </Badge>
            )}
            {statement.paidOn && (
              <Badge tone="info">Paid {formatCalendarDate(statement.paidOn)}</Badge>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {figures.map((figure) => (
          <div key={figure.name} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {figure.name}
            </dt>
            <dd
              className={`text-lg font-semibold tabular-nums text-slate-900 ${figure.tone ?? ''}`}
            >
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3 font-medium">Interval</th>
              {hasTarget && <th className="px-3 py-1 text-right font-medium">Expected</th>}
              {labels.map((label) => (
                <th key={label} className="px-3 py-1 text-right font-medium">
                  {single ? 'Patients' : label}
                </th>
              ))}
              {!single && <th className="px-3 py-1 text-right font-medium">Total</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {intervals.map((interval) => (
              <tr key={interval.startDate}>
                <td className="py-1.5 pr-3 text-slate-700">
                  {formatCalendarDate(interval.startDate, { year: false })} –{' '}
                  {formatCalendarDate(interval.endDate)}
                </td>
                {hasTarget && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {interval.expected ?? '—'}
                  </td>
                )}
                {labels.map((label) => (
                  <td key={label} className="px-3 py-1.5 text-right tabular-nums">
                    {interval.counts.find((count) => count.label === label)?.count ?? 0}
                  </td>
                ))}
                {!single && (
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {interval.actual}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {statement.note && <p className="mt-3 text-sm text-slate-700">{statement.note}</p>}
    </Card>
  );
}
