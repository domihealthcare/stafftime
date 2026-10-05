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
    <div className="flex min-h-screen flex-col justify-center bg-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo className="mb-4 h-24 w-auto" />
          <h1 className="text-2xl font-semibold text-slate-900">Domi Staff</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sign in to clock in, check your schedule and keep up with the team.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
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

            <div>
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
              />
            </div>

            {error && <Alert>{error}</Alert>}

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:text-brand-900">
            Forgotten your password?
          </Link>
        </p>

        {posts.length > 0 && (
          <section aria-label="News" className="mt-6 space-y-3">
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                data-testid="public-post"
              >
                <h2 className="font-semibold text-slate-900">{post.title}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                {post.body && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{post.body}</p>
                )}
              </article>
            ))}
          </section>
        )}

        <InstallTip />
      </div>
    </div>
  );
}
