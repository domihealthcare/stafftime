import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { NotSignedIn } from '../lib/types';
import { buttonClass } from './ui';

/**
 * "Staff who never signed in" (October 2026, Dominguez — a "smarter" idea):
 * everybody still here who has never once signed in to the app, with what is
 * most likely holding them up and the one thing to do about it — usually
 * the welcome email, sent or sent again. On the Staff screen (admins).
 */
const SAYS: Record<NotSignedIn['standing'], string> = {
  'not-invited': 'Never sent a welcome email',
  'link-expired': 'Welcome link ran out',
  'temporary-password':
    'Has a temporary password from an admin — give it to them, or they can use “Forgotten your password?”',
  'password-not-used': 'Chose a password but has not signed in yet',
  'link-waiting': 'Welcome link sent, still good',
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function NotSignedInCard({ refreshKey }: { refreshKey: number }) {
  const [people, setPeople] = useState<NotSignedIn[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .notSignedIn()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);
  useEffect(() => load(), [load, refreshKey]);

  async function send(person: NotSignedIn) {
    setSending(person.id);
    setProblem(null);
    try {
      await api.sendWelcome(person.id);
      load();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not send it just now.');
    } finally {
      setSending(null);
    }
  }

  if (!people || people.length === 0) return null;
  return (
    <details
      className="group mb-4 rounded-xl bg-white ring-1 ring-inset ring-slate-200"
      data-testid="not-signed-in"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-slate-500 transition group-open:rotate-90">
          ▸
        </span>
        <span className="font-semibold text-slate-900">
          {people.length} {people.length === 1 ? 'person has' : 'people have'} never signed in
        </span>
        <span className="text-slate-600">— and what to do about each</span>
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4">
        {people.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 text-sm">
              <span className="font-medium text-slate-900">{person.name}</span>{' '}
              <span className="text-slate-500">{person.email}</span>
              <span className="block text-slate-700">
                {SAYS[person.standing]}
                {person.welcomeSentAt &&
                  (person.standing === 'link-waiting' || person.standing === 'link-expired') &&
                  ` (sent ${day(person.welcomeSentAt)})`}
                {person.usesTimeClock && ' · clocks in at the time clock'}
              </span>
            </span>
            {person.canSendWelcome && (
              <button
                type="button"
                disabled={sending !== null}
                onClick={() => void send(person)}
                className={buttonClass('secondary', 'sm')}
              >
                {sending === person.id
                  ? 'Sending…'
                  : person.welcomeSentAt
                    ? 'Send it again'
                    : 'Send welcome email'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {problem && <p className="px-4 pb-3 text-sm text-rose-700">{problem}</p>}
    </details>
  );
}
