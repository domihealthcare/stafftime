import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card } from '../components/ui';
import { ApiError, api } from '../lib/api';

/**
 * Asking for a reset link.
 *
 * The screen says the same thing whether or not the address belongs to anybody,
 * because the server does. "No such account" on an unauthenticated form is a
 * way to find out who works at the practice.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const result = await api.requestPasswordReset(email);
      setSent(result.message);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-semibold text-slate-900">
          Reset your password
        </h1>
        <p className="mb-6 text-center text-sm text-slate-600">
          We will email you a link.
        </p>

        <Card className="p-6">
          {sent ? (
            <>
              <Alert tone="success">{sent}</Alert>
              <p className="mt-3 text-sm text-slate-600">
                The link works once and stops working after 30 minutes. Check the spam
                folder if it does not turn up.
              </p>
            </>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              {error && <Alert>{error}</Alert>}

              <button
                type="submit"
                disabled={sending || email.trim() === ''}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-sm">
          <Link to="/" className="font-medium text-brand-700 hover:text-brand-900">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
