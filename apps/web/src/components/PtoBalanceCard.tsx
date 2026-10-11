import { locale, plural, useT } from '../lib/i18n';
import { hasNone } from '../lib/time-off';
import type { AllowanceBalance, PtoBalance } from '../lib/types';
import { Card } from './ui';

/// What the person actually wants to know before asking for time off.
export function PtoBalanceCard({ balance, title }: { balance: PtoBalance; title?: string }) {
  const t = useT();
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title ?? t('Your balance')}</h2>
        <span className="text-xs text-slate-500">
          {t('{year} policy year · to {date}', {
            year: balance.policyYear,
            date: new Date(`${balance.yearEnd}T00:00:00Z`).toLocaleDateString(locale(), {
              timeZone: 'UTC',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
          })}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Allowance label="PTO" allowance={balance.vacation} />
        <Allowance label={t('Sick')} allowance={balance.sick} />
      </div>

      {balance.unpaidAndOther > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {plural(
            balance.unpaidAndOther,
            'Plus {n} day of unpaid or bereavement leave, which does not come out of either allowance.',
            'Plus {n} days of unpaid or bereavement leave, which does not come out of either allowance.',
          )}
        </p>
      )}
    </Card>
  );
}

function Allowance({ label, allowance }: { label: string; allowance: AllowanceBalance }) {
  const t = useT();
  const over = allowance.remaining < 0;

  if (hasNone(allowance)) {
    return (
      <div className="rounded-lg bg-slate-50 p-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <p className="mt-1 text-sm text-slate-500">{t('None this year.')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span
          className={`text-2xl font-semibold tabular-nums ${
            over ? 'text-rose-700' : 'text-slate-900'
          }`}
        >
          {allowance.remaining}
        </span>
      </div>
      <p className="mt-0.5 text-right text-xs text-slate-500">
        {plural(allowance.available, 'of {n} day left', 'of {n} days left')}
      </p>

      <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
        <Line term={t('Allowance')} value={allowance.entitled} />
        {allowance.carriedOver > 0 && (
          <Line term={t('Carried over')} value={allowance.carriedOver} />
        )}
        {allowance.usedBefore > 0 && (
          <Line term={t('Taken before Domi Staff')} value={allowance.usedBefore} />
        )}
        {allowance.used - allowance.usedBefore > 0 && (
          <Line
            term={t('Taken')}
            value={Math.round((allowance.used - allowance.usedBefore) * 10) / 10}
          />
        )}
        {allowance.pending > 0 && <Line term={t('Awaiting approval')} value={allowance.pending} />}
      </dl>

      {over && (
        <p className="mt-2 text-xs font-medium text-rose-700">
          {plural(
            Math.abs(allowance.remaining),
            '{n} day over the allowance.',
            '{n} days over the allowance.',
          )}
        </p>
      )}
    </div>
  );
}

function Line({ term, value }: { term: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
