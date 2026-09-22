import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Card } from '../components/ui';
import { ApiError, api } from '../lib/api';

/**
 * Spending a reset link.
 *
 * Setting a password here signs out every session on the account, including any
 * the person did not start. If the reason for the reset was that somebody else
 * had the old password, leaving their session alive would defeat the exercise —
 * so the screen says that rather than letting it be a surprise.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm !== '' && password !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not work. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <Shell title="That link is not complete">
        <Alert>
          The address is missing its token. Open the link from the email itself, or ask
          for a new one.
        </Alert>
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:text-brand-900">
            Ask for a new link
          </Link>
        </p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Your password is set">
        <Alert tone="success">
          You have been signed out everywhere, on every device. Sign in again with the
          new password.
        </Alert>
        <p className="mt-4 text-center text-sm">
          <Link to="/" className="font-medium text-brand-700 hover:text-brand-900">
            Go to sign in
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {/* The hint sits outside the label and is tied on with
            aria-describedby. Inside it, it would become part of the field's
            name — "New password At least 12 characters…" — which is both wrong
            for a screen reader and impossible to address in a test. */}
        <div>
          <label htmlFor="new" className="block text-sm font-medium text-slate-700">
            New password
          </label>
          <input
            id="new"
            aria-describedby="new-hint"
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <p id="new-hint" className="mt-1 text-xs text-slate-500">
            At least 12 characters. Three unrelated words work well.
          </p>
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        {mismatch && <p className="text-sm text-rose-700">Those passwords do not match</p>}
        {error && <Alert>{error}</Alert>}

        <p className="text-xs text-slate-500">
          Setting a new password signs you out everywhere, on every device.
        </p>

        <button
          type="submit"
          disabled={saving || password === '' || mismatch || confirm === ''}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Set my password'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">{title}</h1>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  );
}
