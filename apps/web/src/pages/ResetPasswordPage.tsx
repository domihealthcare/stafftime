import { BrandLogo } from '../components/Brand';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PasswordField } from '../components/PasswordField';
import { Alert, Card } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { PASSWORD_RULE, meetsPasswordRule } from '../lib/password';

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
          The address is missing its token. Open the link from the email itself, or ask for a new
          one.
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
          You have been signed out everywhere, on every device. Sign in again with the new password.
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
            name — "New password At least 8 characters…" — which is both wrong
            for a screen reader and impossible to address in a test. */}
        <PasswordField
          id="new"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          autoFocus
          requirement={{
            label: PASSWORD_RULE,
            met: meetsPasswordRule(password),
          }}
        />

        <PasswordField
          id="confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />

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
        <BrandLogo className="mx-auto mb-6 h-24 w-auto" />
        <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">{title}</h1>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  );
}
