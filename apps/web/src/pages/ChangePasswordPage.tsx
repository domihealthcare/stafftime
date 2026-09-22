import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import { Alert, Card } from '../components/ui';

/**
 * Shown on its own when a temporary password is still in force — the server
 * blocks every other route until it is replaced, so there is nowhere else to go.
 * Also reachable from the header as an ordinary password change.
 */
export function ChangePasswordPage({ forced }: { forced: boolean }) {
  const { refresh, signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirmation.length > 0 && confirmation !== newPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 12;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 12 && confirmation === newPassword;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setDone(
        result.otherSessionsSignedOut > 0
          ? `Password changed. ${result.otherSessionsSignedOut} other signed-in ${
              result.otherSessionsSignedOut === 1 ? 'browser was' : 'browsers were'
            } signed out.`
          : 'Password changed.',
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        forced ? 'flex min-h-screen flex-col justify-center bg-slate-100 px-4 py-12' : ''
      }
    >
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">
            {forced ? 'Choose a new password' : 'Change your password'}
          </h1>
          {forced && (
            <p className="mt-1 text-sm text-slate-600">
              You are signed in with a temporary password. Replace it to continue.
            </p>
          )}
        </div>

        <Card className="p-6">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <label htmlFor="current" className="block text-sm font-medium text-slate-700">
                {forced ? 'Temporary password' : 'Current password'}
              </label>
              <input
                id="current"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
              />
            </div>

            <div>
              <label htmlFor="new" className="block text-sm font-medium text-slate-700">
                New password
              </label>
              <input
                id="new"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
              />
              <p className={`mt-1 text-xs ${tooShort ? 'text-rose-600' : 'text-slate-500'}`}>
                At least 12 characters. Three unrelated words make a strong, memorable
                password.
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
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
              />
              {mismatch && (
                <p className="mt-1 text-xs text-rose-600">Those passwords do not match.</p>
              )}
            </div>

            {error && <Alert>{error}</Alert>}
            {done && <Alert tone="success">{done}</Alert>}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </Card>

        {forced && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
