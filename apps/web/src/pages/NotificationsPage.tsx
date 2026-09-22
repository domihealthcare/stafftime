import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useIsManager, useSession } from '../lib/session';
import { Alert, Card } from '../components/ui';

/// What the nightly email actually contains, in the order it lists them. Worth
/// spelling out on the page that offers to stop sending it: "turn off
/// notifications" is a much easier decision to regret when nobody said what
/// you would stop hearing about.
const CONTENTS = [
  'Kiosk tablets that have stopped being used',
  'Next week’s rota, when it is close and still unpublished',
  'Shifts still scheduled for people who have left',
  'Licences and certifications about to lapse, or already lapsed',
  'Hours nobody has approved yet',
  'Checklist tasks past their due date',
  'Punches with no clock-out',
  'Time off waiting on a decision',
];

export function NotificationsPage() {
  const { employee, refresh } = useSession();
  const isManager = useIsManager();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribed = employee?.wantsDailyDigest ?? true;

  async function setSubscribed(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.setDigestPreference(next);
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Notifications</h1>
      <p className="mb-4 text-sm text-slate-600">
        What the app emails you, and how often.
      </p>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              The nightly round-up
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              One email, once a night, listing what needs a look. It is only sent on
              nights when there is something to say — most nights there is not.
            </p>
          </div>

          {/* A switch rather than a checkbox: this is a thing that is on or off,
              not a field in a form that needs saving afterwards. */}
          <button
            type="button"
            role="switch"
            aria-checked={subscribed}
            aria-label="The nightly round-up"
            disabled={busy}
            onClick={() => void setSubscribed(!subscribed)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
              subscribed ? 'bg-brand-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                subscribed ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          What it covers
        </p>
        <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
          {CONTENTS.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-slate-500">
          {subscribed
            ? 'Turning this off loses the nudge, not the information — all of it is still on the screen it belongs to.'
            : 'You are not being emailed. All of this is still on the screen it belongs to; nothing is hidden from you.'}
        </p>

        {!isManager && (
          <p className="mt-3 text-xs text-slate-500">
            This round-up is only sent to managers and administrators, so this setting
            does not currently change anything for you.
          </p>
        )}
      </Card>
    </div>
  );
}
