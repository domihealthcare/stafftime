import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import type { SecretSanta } from '../lib/types';
import { Card } from './ui';

/**
 * Secret Santa on Home (November 2026): one you can sign up to, one you are
 * in waiting for the draw, or the one where your name is drawn. Never the
 * name you drew, as Home is open on shared screens: that is behind "Show who
 * I drew" and the PIN on the Secret Santa page. Nothing once the exchange day has passed,
 * and it fails quietly like every Home card.
 */
export function SecretSantaCard() {
  const t = useT();
  const [items, setItems] = useState<SecretSanta[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .secretSantas()
      .then((found) => !cancelled && setItems(found))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const today = practiceDate();
  const shown = (items ?? []).filter(
    (exchange) =>
      (!exchange.exchangeOn || exchange.exchangeOn >= today) &&
      (exchange.me.inIt || exchange.me.canJoin),
  );
  if (shown.length === 0) return null;

  return (
    <Card className="overflow-hidden border-rose-200" testId="home-secret-santa">
      <h2 className="bg-gradient-to-r from-emerald-800 to-rose-800 px-4 py-2 text-base font-semibold text-white">
        <span aria-hidden="true">🎅</span> {t('Domi Secret Santa')}{' '}
        <span aria-hidden="true" className="text-sm">
          ❄ 🎄 ❄
        </span>
      </h2>
      <ul className="space-y-3 bg-gradient-to-b from-rose-50/60 to-white p-4 text-sm">
        {shown.map((exchange) => (
          <li key={exchange.id}>
            <p className="font-medium text-slate-900">{exchange.title}</p>
            <p className="text-slate-600">
              {t('Budget {amount}', { amount: `$${exchange.budgetDollars}` })} ·{' '}
              {exchange.exchangeOn
                ? formatCalendarDate(exchange.exchangeOn, { year: false })
                : t('day to be set')}
            </p>
            <Link
              to={`/secret-santa/${exchange.id}`}
              className="mt-1 inline-block font-medium text-brand-700 hover:text-brand-900"
            >
              {exchange.me.drawn
                ? t('See who you drew →')
                : exchange.me.inIt
                  ? t('You are in. Add gift ideas →')
                  : t('Sign up →')}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
