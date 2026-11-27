import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { t as translate, useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { useSession } from '../lib/session';
import type { SecretSantaInvitation } from '../lib/types';
import { Modal } from './Modal';
import { Alert, buttonClass, inputClass } from './ui';

/// "Decide later" hides an invitation until the next day, on this browser.
const LATER_KEY = 'secretSanta.later';
const MAX_REASON = 300;

function laterToday(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(LATER_KEY) ?? 'null') as {
      day: string;
      ids: string[];
    } | null;
    return new Set(saved?.day === practiceDate() ? saved.ids : []);
  } catch {
    return new Set();
  }
}

function putOff(id: string) {
  try {
    const ids = [...laterToday(), id];
    localStorage.setItem(LATER_KEY, JSON.stringify({ day: practiceDate(), ids }));
  } catch {
    // Without storage it simply asks again next time.
  }
}

/**
 * The Secret Santa invitation that greets staff when they sign in (27
 * November 2026, Dominguez: "all potential staff should be prompted when they
 * sign into portal to either accept or deny participation in the secret
 * santa - and given an option to say why or why not"). One at a time, until
 * each is answered: **Count me in** or **No thanks**, with an optional
 * reason the organizers read. **Decide later** puts it off until tomorrow.
 * Not while an admin is viewing as somebody, and never for a shared account
 * (the server sends none).
 */
export function SecretSantaInvite() {
  const t = useT();
  const { employee } = useSession();
  const [queue, setQueue] = useState<SecretSantaInvitation[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ joined: boolean; id: string } | null>(null);
  const viewingAs = Boolean(employee?.viewingAs);
  const employeeId = employee?.id ?? null;

  useEffect(() => {
    if (!employeeId || viewingAs) return;
    let cancelled = false;
    api
      .secretSantaInvitations()
      .then((found) => {
        if (cancelled) return;
        const later = laterToday();
        setQueue(found.filter((invitation) => !later.has(invitation.id)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [employeeId, viewingAs]);

  const current = queue[0];
  const next = () => {
    setQueue((now) => now.slice(1));
    setReason('');
    setError(null);
    setDone(null);
  };

  if (done) {
    return (
      <Modal title={t('Domi Secret Santa')} onClose={next} testId="secret-santa-invite">
        <div className="space-y-3 text-sm text-slate-700" role="status">
          {done.joined ? (
            <>
              <p className="text-base font-semibold text-emerald-900">
                <span aria-hidden="true">🎉 </span>
                {t('You are in!')}
              </p>
              <p>
                {t(
                  'You are told who you drew once the names are drawn. Meanwhile, add some gift ideas for whoever draws you.',
                )}
              </p>
            </>
          ) : (
            <p>
              {t(
                'Thanks for letting us know. You can still sign up later while sign-ups are open.',
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {done.joined && (
              <Link
                to={`/secret-santa/${done.id}`}
                onClick={next}
                className={buttonClass('primary', 'sm')}
              >
                {t('Add my gift ideas')}
              </Link>
            )}
            <button type="button" className={buttonClass('secondary', 'sm')} onClick={next}>
              {t('Close')}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!current) return null;

  async function answer(choice: 'JOIN' | 'DECLINE') {
    setBusy(true);
    setError(null);
    try {
      await api.replySecretSanta(current.id, choice, reason.trim() || null);
      setDone({ joined: choice === 'JOIN', id: current.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translate('Could not save your answer.'));
    } finally {
      setBusy(false);
    }
  }

  const where = [current.location?.name, current.place].filter(Boolean).join(', ');
  return (
    <Modal
      title={t('Domi Secret Santa')}
      onClose={() => {
        putOff(current.id);
        next();
      }}
      testId="secret-santa-invite"
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-rose-800 p-4 text-white">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-2 select-none text-5xl opacity-30"
          >
            🎄
          </span>
          <p className="relative text-lg font-bold">
            <span aria-hidden="true">🎅 </span>
            {current.title}
          </p>
          <ul className="relative mt-2 flex flex-wrap gap-2 text-xs">
            <li className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/25">
              <span aria-hidden="true">🎁 </span>
              {t('Budget {amount}', { amount: `$${current.budgetDollars}` })}
            </li>
            <li className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/25">
              <span aria-hidden="true">📅 </span>
              {current.exchangeOn
                ? formatCalendarDate(current.exchangeOn)
                : t('Day of the exchange still to be set')}
            </li>
            {where && (
              <li className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/25">
                <span aria-hidden="true">📍 </span>
                {where}
              </li>
            )}
          </ul>
        </div>

        <p className="text-sm text-slate-700">
          {current.added
            ? t('You have been added to the Secret Santa. Would you like to take part?')
            : t('Would you like to take part in the Secret Santa?')}{' '}
          {t(
            'Everyone in it draws one colleague at random and secretly buys them a gift within the budget.',
          )}
          {current.signUpUntil &&
            !current.added &&
            ` ${t('Sign up by {day}.', { day: formatCalendarDate(current.signUpUntil) })}`}
        </p>
        {current.notes && (
          <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {current.notes}
          </p>
        )}

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">
            {t('Why or why not? (optional)')}
          </span>
          <textarea
            rows={2}
            maxLength={MAX_REASON}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`mt-1 ${inputClass}`}
          />
          <span className="mt-1 block text-xs text-slate-600">
            {t('Whoever organizes it reads this.')}
          </span>
        </label>

        {error && <Alert>{error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass('primary', 'md')}
            disabled={busy}
            onClick={() => void answer('JOIN')}
          >
            <span aria-hidden="true">🎁 </span>
            {t('Count me in')}
          </button>
          <button
            type="button"
            className={buttonClass('secondary', 'md')}
            disabled={busy}
            onClick={() => void answer('DECLINE')}
          >
            {t('No thanks')}
          </button>
          <button
            type="button"
            className="tap ml-auto text-sm font-medium text-slate-600 hover:text-slate-900"
            onClick={() => {
              putOff(current.id);
              next();
            }}
          >
            {t('Decide later')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
