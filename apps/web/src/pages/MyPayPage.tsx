import { useEffect, useState } from 'react';
import { LockPayButton } from '../components/PinGate';
import { Alert, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import type { MyPay, PayRateUnit } from '../lib/types';

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Your pay (November 2026, Kayla: "if notification of raise be made into a
 * feature into DomiStaff portal - that would be great. Typically, I will email
 * the individual"; Dominguez: their pay now as well). Somebody's own pay in
 * force today and the raises they have been told about, with the words
 * written for them. Read-only, only ever theirs (the server takes who they are
 * from the session), and behind their PIN like every screen with pay.
 */
export function MyPayPage() {
  const t = useT();
  const [pay, setPay] = useState<MyPay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .myPay()
      .then((row) => !cancelled && setPay(row))
      .catch(
        (cause: unknown) =>
          !cancelled &&
          setError(cause instanceof ApiError ? cause.message : t('Could not load your pay.')),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pay && !error) return <Spinner label={t('Loading your pay')} />;

  const amount = (rate: number, unit: PayRateUnit) =>
    t(unit === 'HOURLY' ? '{pay} an hour' : '{pay} a year', { pay: DOLLARS.format(rate) });
  const today = practiceDate();

  return (
    <div className="max-w-3xl">
      <PageHeading
        title={t('Your pay')}
        subtitle={t(
          'Your pay as Domi Staff has it, and the raises you have been told about. Only you and the people who look after pay can see this. Your paycheck comes from ADP.',
        )}
      />
      <div className="mb-4">
        <LockPayButton />
      </div>

      {error && <Alert>{error}</Alert>}

      {pay && (
        <div className="space-y-4">
          <Card className="p-4" testId="my-pay-now">
            <h2 className="text-base font-semibold text-slate-900">{t('Now')}</h2>
            {pay.current.pay || pay.current.position ? (
              <dl className="mt-2 space-y-1 text-sm">
                {pay.current.pay && (
                  <div>
                    <dt className="inline font-medium text-slate-800">{t('Pay')}: </dt>
                    <dd className="inline">
                      {amount(pay.current.pay.rate, pay.current.pay.unit)}{' '}
                      <span className="text-slate-600">
                        {t('since {day}', { day: formatCalendarDate(pay.current.pay.since) })}
                      </span>
                    </dd>
                  </div>
                )}
                {pay.current.position && (
                  <div>
                    <dt className="inline font-medium text-slate-800">{t('Position')}: </dt>
                    <dd className="inline">
                      {pay.current.position.value}{' '}
                      <span className="text-slate-600">
                        {t('since {day}', { day: formatCalendarDate(pay.current.position.since) })}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-600">{t('No pay on file yet.')}</p>
            )}
          </Card>

          <Card className="p-4" testId="my-raises">
            <h2 className="text-base font-semibold text-slate-900">{t('Raises')}</h2>
            {pay.raises.length === 0 ? (
              <div className="mt-2">
                <EmptyState>{t('No raises to show yet.')}</EmptyState>
              </div>
            ) : (
              <ol className="mt-2 space-y-3" aria-label={t('Raises')}>
                {pay.raises.map((raise) => (
                  <li
                    key={raise.id}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"
                    data-testid="my-raise"
                  >
                    <p className="font-medium text-emerald-900">
                      {amount(raise.newRate, raise.newUnit)}
                      {raise.newPosition && ` · ${raise.newPosition}`}
                    </p>
                    <p className="text-emerald-900">
                      {t(raise.effectiveOn > today ? 'Starts {day}' : 'Since {day}', {
                        day: formatCalendarDate(raise.effectiveOn),
                      })}
                    </p>
                    {raise.message && (
                      <blockquote className="mt-2 whitespace-pre-line border-l-2 border-emerald-300 pl-3 text-slate-800">
                        {raise.message}
                        {raise.toldBy && (
                          <footer className="mt-1 text-xs text-slate-600">- {raise.toldBy}</footer>
                        )}
                      </blockquote>
                    )}
                    {!raise.message && raise.toldBy && (
                      <p className="mt-1 text-xs text-slate-600">
                        {t('From {name}', { name: raise.toldBy })}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
