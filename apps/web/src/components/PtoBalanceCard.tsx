import type { AllowanceBalance, PtoBalance } from '../lib/types';
import { Card } from './ui';

/// What the person actually wants to know before asking for time off.
export function PtoBalanceCard({ balance }: { balance: PtoBalance }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Your balance</h2>
        <span className="text-xs text-slate-500">
          {balance.policyYear} policy year · to{' '}
          {new Date(`${balance.yearEnd}T00:00:00Z`).toLocaleDateString(undefined, {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Allowance label="PTO" allowance={balance.vacation} />
        <Allowance label="Sick" allowance={balance.sick} />
      </div>

      {balance.unpaidAndOther > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Plus {balance.unpaidAndOther} day{balance.unpaidAndOther === 1 ? '' : 's'} of
          unpaid or bereavement leave, which does not come out of either allowance.
        </p>
      )}
    </Card>
  );
}

function Allowance({ label, allowance }: { label: string; allowance: AllowanceBalance }) {
  const over = allowance.remaining < 0;

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
        of {allowance.available} day{allowance.available === 1 ? '' : 's'} left
      </p>

      <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
        <Line term="Allowance" value={allowance.entitled} />
        {allowance.carriedOver > 0 && (
          <Line term="Carried over" value={allowance.carriedOver} />
        )}
        {allowance.used > 0 && <Line term="Taken" value={allowance.used} />}
        {allowance.pending > 0 && (
          <Line term="Awaiting approval" value={allowance.pending} />
        )}
      </dl>

      {over && (
        <p className="mt-2 text-xs font-medium text-rose-700">
          {Math.abs(allowance.remaining)} day{Math.abs(allowance.remaining) === 1 ? '' : 's'}{' '}
          over the allowance.
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
