import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import type { AllowanceBalance, PtoBalance } from '../lib/types';
import { Modal } from './Modal';
import { buttonClass } from './ui';

/**
 * At the start of every month, a pop-up on Home with the time off somebody
 * has left (October 2026, Dominguez, from staff feedback: "so they are
 * aware"). Once a month: closing it, either way, is "seen" until the next.
 * The server decides whether it is due (`balance-reminder.service.ts`).
 */
export function MonthBalancePopup() {
  const t = useT();
  const [balance, setBalance] = useState<PtoBalance | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .ptoMonthReminder()
      .then((due) => !cancelled && due.show && setBalance(due.balance))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!balance) return null;

  function close() {
    setBalance(null);
    void api.ptoMonthReminderSeen().catch(() => undefined);
  }

  return (
    <Modal title={t('Your time off this month')} onClose={close} testId="month-balance">
      <p className="text-sm text-slate-700">
        {t('A reminder of what you have left this year, so nothing comes as a surprise.')}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Left label="PTO" allowance={balance.vacation} />
        <Left label={t('Sick')} allowance={balance.sick} />
      </dl>
      {balance.sick.accrual && (
        <p className="mt-2 text-xs text-slate-500">
          {t('Sick time is earned as you work: an hour for every 30 hours, up to {days} days.', {
            days: balance.sick.accrual.upToDays,
          })}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Link to="/time-off?request=1" onClick={close} className={buttonClass('secondary', 'sm')}>
          {t('Request time off')}
        </Link>
        <button type="button" onClick={close} className={buttonClass('primary', 'sm')}>
          {t('Got it')}
        </button>
      </div>
    </Modal>
  );
}

function Left({ label, allowance }: { label: string; allowance: AllowanceBalance }) {
  const t = useT();
  return (
    <div className="rounded-lg bg-slate-50 p-3" data-testid={`month-balance-${label}`}>
      <dt className="text-sm font-medium text-slate-700">{label}</dt>
      <dd className="mt-1">
        <span
          className={`text-2xl font-semibold tabular-nums ${
            allowance.remaining < 0 ? 'text-rose-700' : 'text-slate-900'
          }`}
        >
          {allowance.remaining}
        </span>{' '}
        <span className="text-xs text-slate-500">{t('days left')}</span>
        {allowance.pending > 0 && (
          <span className="block text-xs text-slate-500">
            {t('{n} waiting for approval', { n: allowance.pending })}
          </span>
        )}
      </dd>
    </div>
  );
}
