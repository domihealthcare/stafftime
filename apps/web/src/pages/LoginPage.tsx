import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, type PublicPost } from '../lib/api';
import { useSession } from '../lib/session';
import { BrandLogo } from '../components/Brand';
import { InstallTip } from '../components/InstallTip';
import { PasswordField } from '../components/PasswordField';
import { Alert, Card } from '../components/ui';

export function LoginPage() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // News posts an admin ticked to show publicly. A nicety: if they cannot be
  // loaded, the sign-in form is all there is, as before.
  const [posts, setPosts] = useState<PublicPost[]>([]);
  useEffect(() => {
    api
      .publicPosts()
      .then(setPosts)
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        {/* News first (Dominguez, October 2026): it is what changes from one
            visit to the next, and the form below is the same every time. */}
        {posts.length > 0 && (
          <section aria-label="News" className="mb-6 space-y-2">
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                data-testid="public-post"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold text-slate-900">{post.title}</h2>
                  <p className="shrink-0 text-xs text-slate-500">
                    {new Date(post.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                {post.body && (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{post.body}</p>
                )}
              </article>
            ))}
          </section>
        )}

        <div className="mb-4 flex items-center gap-3">
          <BrandLogo className="h-12 w-auto shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">Domi Staff</h1>
            <p className="text-xs text-slate-600">
              Sign in to clock in, check your schedule and keep up with the team.
            </p>
          </div>
        </div>

        <Card className="p-4">
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
              />
            </div>

            <PasswordField id="password" label="Password" value={password} onChange={setPassword} />

            {error && <Alert>{error}</Alert>}

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="mt-3 text-center text-sm">
            <Link
              to="/forgot-password"
              className="tap font-medium text-brand-700 hover:text-brand-900"
            >
              Forgotten your password?
            </Link>
          </p>
        </Card>

        <InstallTip />
      </div>
    </div>
  );
}
