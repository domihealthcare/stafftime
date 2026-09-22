import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { useIsAdmin } from '../lib/session';
import type { Announcement } from '../lib/types';

/**
 * Every announcement, newest first — the practice's noticeboard.
 *
 * Admins write here. One post is always primary, and that one leads the home
 * screen; the rest stay here to be scrolled back through, like a blog.
 */
export function NewsPage() {
  const isAdmin = useIsAdmin();
  const [posts, setPosts] = useState<Announcement[]>([]);
  const [writing, setWriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPosts(await api.announcements());
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the news.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Loading the news" />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="News"
        subtitle={
          isAdmin
            ? 'Everything posted for staff, newest first. The primary post is the one everybody sees when they sign in.'
            : 'Everything posted for staff, newest first.'
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {isAdmin && (
        <div className="mb-4">
          {writing ? (
            <PostForm
              firstPost={posts.length === 0}
              onSaved={() => {
                setWriting(false);
                void load();
              }}
              onCancel={() => setWriting(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + New post
            </button>
          )}
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState>Nothing has been posted yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canManage={isAdmin}
              onChanged={() => void load()}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  canManage,
  onChanged,
  onError,
}: {
  post: Announcement;
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <PostForm
        post={post}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const author = post.author
    ? `${post.author.preferredName ?? post.author.firstName} ${post.author.lastName}`
    : null;

  return (
    <Card className="p-4" testId={`post-${post.id}`}>
      <article>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900">{post.title}</h2>
          {post.isPrimary && <Badge tone="info">Primary</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatPostDate(post.createdAt)}
          {author && ` · ${author}`}
          {post.editedAt && ` · edited ${formatPostDate(post.editedAt)}`}
        </p>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{post.body}</p>
      </article>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs">
          {!post.isPrimary && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(
                  () => api.updateAnnouncement(post.id, { isPrimary: true }),
                  'Could not make that the primary post.',
                )
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Make primary
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-slate-600">
                {post.isPrimary
                  ? 'Delete it? The newest other post becomes primary.'
                  : 'Delete it?'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => api.deleteAnnouncement(post.id), 'Could not delete that.')
                }
                className="font-semibold text-rose-700"
              >
                Delete it
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-slate-500">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="font-medium text-slate-400 hover:text-rose-700"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/// One form for writing and editing. The primary tick behaves differently in
/// the two cases the rule makes special: the first post has to be primary, and
/// the current primary cannot be unticked — only replaced by ticking another.
function PostForm({
  post,
  firstPost = false,
  onSaved,
  onCancel,
}: {
  post?: Announcement;
  firstPost?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [isPrimary, setIsPrimary] = useState(post?.isPrimary ?? firstPost);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryLocked = firstPost || post?.isPrimary === true;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = { title: title.trim(), body: body.trim() };
      if (post) {
        await api.updateAnnouncement(post.id, {
          ...payload,
          ...(isPrimary && !post.isPrimary ? { isPrimary: true } : {}),
        });
      } else {
        await api.createAnnouncement({ ...payload, isPrimary });
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Title</span>
          <input
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            placeholder="West New York closes at 2pm on Friday"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Message</span>
          <textarea
            aria-label="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            maxLength={10_000}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPrimary}
            disabled={primaryLocked}
            onChange={(event) => setIsPrimary(event.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600 disabled:opacity-60"
          />
          <span>
            <span className="font-medium text-slate-700">Primary announcement</span>
            <span className="block text-xs text-slate-500">
              {firstPost
                ? 'The first post is always primary — there has to be one.'
                : post?.isPrimary
                  ? 'This is the primary post. To change that, make another post primary.'
                  : 'Shown at the top of everybody’s home screen, in place of the current one.'}
            </span>
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || title.trim().length < 2 || body.trim() === ''}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : post ? 'Save changes' : 'Post it'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}

/// With the year: the news goes back further than the current one.
function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
