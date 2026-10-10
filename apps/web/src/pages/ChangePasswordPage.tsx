import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import { PasswordField } from '../components/PasswordField';
import { Alert, Card } from '../components/ui';
import { PASSWORD_RULE, meetsPasswordRule } from '../lib/password';
import { plural, useT } from '../lib/i18n';

/**
 * Shown on its own when a temporary password is still in force — the server
 * blocks every other route until it is replaced, so there is nowhere else to go.
 * Also reachable from the header as an ordinary password change.
 */
export function ChangePasswordPage({ forced }: { forced: boolean }) {
  const t = useT();
  const { refresh, signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirmation.length > 0 && confirmation !== newPassword;
  // The length rule is now shown live by the field itself, rather than as a
  // separate line that only turned red after the fact.
  const canSubmit =
    currentPassword.length > 0 && meetsPasswordRule(newPassword) && confirmation === newPassword;

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
          ? plural(
              result.otherSessionsSignedOut,
              'Password changed. {n} other signed-in browser was signed out.',
              'Password changed. {n} other signed-in browsers were signed out.',
            )
          : t('Password changed.'),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not change your password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={forced ? 'flex min-h-screen flex-col justify-center bg-slate-100 px-4 py-12' : ''}
    >
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">
            {forced ? t('Choose a new password') : t('Change your password')}
          </h1>
          {forced && (
            <p className="mt-1 text-sm text-slate-600">
              {t('You are signed in with a temporary password. Replace it to continue.')}
            </p>
          )}
        </div>

        <Card className="p-6">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <PasswordField
                id="current"
                label={forced ? t('Temporary password') : t('Current password')}
                value={currentPassword}
                onChange={setCurrentPassword}
              />
            </div>

            <PasswordField
              id="new"
              label={t('New password')}
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              requirement={{
                label: t(PASSWORD_RULE),
                met: meetsPasswordRule(newPassword),
              }}
            />

            <PasswordField
              id="confirm"
              label={t('Confirm new password')}
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
              error={mismatch ? t('Those passwords do not match.') : undefined}
            />

            {error && <Alert>{error}</Alert>}
            {done && <Alert tone="success">{done}</Alert>}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? t('Saving…') : t('Change password')}
            </button>
          </form>
        </Card>

        {forced && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-900"
          >
            {t('Sign out')}
          </button>
        )}
      </div>
    </div>
  );
}
