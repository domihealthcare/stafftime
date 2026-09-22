import { useState } from 'react';
import { ApiError, kioskApi } from '../lib/api';
import { Alert } from '../components/ui';

/// Shown on a tablet that is not yet bound to a location. An admin generates a
/// code in the web app and it is typed in here, once.
export function KioskPairing({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await kioskApi.pair(code);
      onPaired();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set up this device.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Set up this kiosk</h1>
          <p className="mt-2 text-sm text-slate-600">
            An administrator can generate a pairing code from Kiosks in the web app. It is
            valid for 15 minutes.
          </p>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label htmlFor="code" className="block text-sm font-medium text-slate-700">
            Pairing code
          </label>
          <input
            id="code"
            type="text"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD-EFGH-JK"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="mt-2 w-full rounded-lg border-slate-300 px-4 py-4 text-center font-mono text-2xl tracking-widest shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />

          {error && (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || code.replace(/[^A-Z0-9]/g, '').length < 10}
            className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-4 text-lg font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Setting up…' : 'Set up kiosk'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Once set up, this tablet stays signed in to its location. Staff clock in with their
          PIN.
        </p>
      </div>
    </div>
  );
}
