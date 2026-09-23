import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { PasswordField } from '../components/PasswordField';
import { Alert, Card } from '../components/ui';
import { PASSWORD_RULE, meetsPasswordRule } from '../lib/password';

/**
 * Shown only on a brand-new deployment, when no administrator exists yet and a
 * setup token has been configured. Creates the first account so nobody has to
 * run a command line against the production database.
 */
export function SetupPage({ onCreated }: { onCreated: () => void }) {
  const [setupToken, setSetupToken] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirmation.length > 0 && confirmation !== password;
  const ready =
    setupToken.trim().length >= 8 &&
    email.includes('@') &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    meetsPasswordRule(password) &&
    confirmation === password;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createFirstAdmin({
        setupToken: setupToken.trim(),
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that account.');
      setBusy(false);
    }
  }

  // px-3 matters: without it the text sits flush against the border, which is
  // what a first-time user noticed before anything else on this screen.
  const field =
    'mt-1 w-full rounded-lg border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Set up Domi Time</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create the first administrator account. This screen appears once.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-slate-700">
                Setup token
              </label>
              <input
                id="token"
                type="text"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                className={`${field} font-mono text-sm`}
              />
              <p className="mt-1 text-xs text-slate-500">
                The <code className="font-mono">SETUP_TOKEN</code> you set in your hosting settings.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="first" className="block text-sm font-medium text-slate-700">
                  First name
                </label>
                <input
                  id="first"
                  type="text"
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="last" className="block text-sm font-medium text-slate-700">
                  Last name
                </label>
                <input
                  id="last"
                  type="text"
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className={field}
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="setup-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={field}
              />
            </div>

            <PasswordField
              id="setup-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              requirement={{
                label: PASSWORD_RULE,
                met: meetsPasswordRule(password),
              }}
            />

            <PasswordField
              id="setup-confirm"
              label="Confirm password"
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
              error={mismatch ? 'Those passwords do not match.' : undefined}
            />

            {error && <Alert>{error}</Alert>}

            <button
              type="submit"
              disabled={busy || !ready}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Create administrator'}
            </button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          Afterwards, remove <code className="font-mono">SETUP_TOKEN</code> from your hosting
          settings. This screen will not come back.
        </p>
      </div>
    </div>
  );
}
