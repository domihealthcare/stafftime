import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import { NewsLanguageToggle, usePostWords } from '../components/NewsLanguage';
import { PollView, PostActions, PostComments } from '../components/PostSocial';
import { PostConfirm } from '../components/RequiredItems';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { AI_NOTE, useAiOn } from '../lib/ai';
import { ApiError, api } from '../lib/api';
import { useIsAdmin, useIsManager } from '../lib/session';
import type { Announcement, MyRequirement, PollInput } from '../lib/types';

/**
 * Every announcement, newest first — the practice's noticeboard.
 *
 * Admins write here. One post is always primary, and that one leads the home
 * screen; the rest stay here to be scrolled back through, like a blog.
 *
 * Everybody signed in can like a post, comment under it, and vote in its poll
 * (October 2026) — all by name. A link from the bell ends in `#post-<id>`, and
 * the page scrolls to that post once it has loaded.
 */
export function NewsPage() {
  const isAdmin = useIsAdmin();
  const isManager = useIsManager();
  const aiOn = useAiOn();
  /// Posts somebody has been asked to read and confirm (required reading).
  const [asked, setAsked] = useState<MyRequirement[]>([]);
  const { hash } = useLocation();
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
    api
      .myRequirements()
      .then((found) => setAsked(found.filter((item) => item.announcement)))
      .catch(() => setAsked([]));
  }, [load]);

  // To the post a notification is about, once it is on the page.
  useEffect(() => {
    if (loading || !hash.startsWith('#post-')) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [loading, hash]);

  /// A like, comment or vote comes back as the whole post; put it in place.
  const replace = useCallback((updated: Announcement) => {
    setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)));
  }, []);

  if (loading) return <Spinner label="Loading the news" />;

  return (
    <div className="max-w-3xl">
      <PageHeading
        title="News"
        subtitle={
          isAdmin
            ? 'Everything posted for staff, newest first. The primary post is the one everybody sees when they sign in.'
            : 'Everything posted for staff, newest first.'
        }
      />

      {(aiOn || posts.some((post) => post.titleEs)) && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <span id="news-language-label">Read the news in</span>
          <NewsLanguageToggle />
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {isAdmin && (
        <div className="mb-4">
          {writing ? (
            <PostForm
              aiOn={aiOn}
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
              className={buttonClass('primary', 'md')}
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
              aiOn={aiOn}
              canManage={isAdmin}
              canRequire={isManager}
              required={asked.find((item) => item.announcement?.id === post.id)}
              onConfirmed={(id) =>
                setAsked((current) =>
                  current.map((item) =>
                    item.id === id ? { ...item, doneAt: new Date().toISOString() } : item,
                  ),
                )
              }
              onChanged={() => void load()}
              onReplace={replace}
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
  aiOn,
  canManage,
  canRequire,
  required,
  onConfirmed,
  onChanged,
  onReplace,
  onError,
}: {
  post: Announcement;
  aiOn: boolean;
  canManage: boolean;
  /// Managers and admins may ask people to confirm they have read it.
  canRequire: boolean;
  /// This post, if the reader has been asked to read and confirm it.
  required?: MyRequirement;
  onConfirmed: (requirementId: string) => void;
  onChanged: () => void;
  onReplace: (post: Announcement) => void;
  onError: (message: string) => void;
}) {
  const words = usePostWords(post);
  const [editing, setEditing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

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
        aiOn={aiOn}
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
    <div id={`post-${post.id}`} className="scroll-mt-20">
      <Card className="p-4" testId={`post-${post.id}`}>
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <h2 lang={words.lang} className="font-semibold text-slate-900">
              {words.title}
            </h2>
            {post.isPrimary && <Badge tone="info">Primary</Badge>}
            {canManage && post.showOnTimeClock && <Badge tone="neutral">Public</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatPostDate(post.createdAt)}
            {author && ` · ${author}`}
            {post.editedAt && ` · edited ${formatPostDate(post.editedAt)}`}
          </p>
          {words.body && (
            <p lang={words.lang} className="mt-2 whitespace-pre-line text-sm text-slate-700">
              {words.body}
            </p>
          )}
          {(words.note || words.loading) && (
            <p className="mt-1 text-xs italic text-slate-500" data-testid="post-language-note">
              {words.loading ? 'Traduciendo…' : words.note}
            </p>
          )}
          <PollView post={post} onChange={onReplace} />
          {required && <PostConfirm item={required} onDone={onConfirmed} />}
        </article>

        <PostActions post={post} onChange={onReplace} onComment={() => setCommenting(true)} />
        <PostComments
          post={post}
          onChange={onReplace}
          composing={commenting}
          onComposingChange={setCommenting}
        />

        {canRequire && !canManage && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Link
              to={`/required?post=${post.id}`}
              className="text-sm font-medium text-brand-700 hover:text-brand-900"
            >
              Ask people to confirm they’ve read it →
            </Link>
          </div>
        )}
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
                className={buttonClass('secondary', 'sm')}
              >
                Make primary
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={buttonClass('secondary', 'sm')}
            >
              Edit
            </button>
            <Link to={`/required?post=${post.id}`} className={buttonClass('secondary', 'sm')}>
              Require reading
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete “${post.title}”?`,
                  body: post.isPrimary
                    ? 'It is the primary post. The newest other post becomes primary.'
                    : 'Nobody will see it on the News page any more.',
                  confirmLabel: 'Delete it',
                  cancelLabel: 'Keep it',
                });
                if (sure)
                  await act(() => api.deleteAnnouncement(post.id), 'Could not delete that.');
              }}
              className="font-medium text-slate-500 hover:text-rose-700"
            >
              Delete
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

/// One form for writing and editing. The primary tick behaves differently in
/// the two cases the rule makes special: the first post has to be primary, and
/// the current primary cannot be unticked — only replaced by ticking another.
function PostForm({
  post,
  aiOn = false,
  firstPost = false,
  onSaved,
  onCancel,
}: {
  post?: Announcement;
  aiOn?: boolean;
  firstPost?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  // The Spanish (October 2026): typed, or translated by the AI service and
  // then read through. `touched` is whether it was redone in this edit — if
  // the English changes and it was not, it is cleared rather than left
  // saying the old thing.
  const [titleEs, setTitleEs] = useState(post?.titleEs ?? '');
  const [bodyEs, setBodyEs] = useState(post?.bodyEs ?? '');
  const [spanishByAi, setSpanishByAi] = useState(post?.spanishByAi ?? false);
  const [spanishTouched, setSpanishTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [helping, setHelping] = useState(false);
  const [aiBusy, setAiBusy] = useState<'draft' | 'translate' | null>(null);
  const [isPrimary, setIsPrimary] = useState(post?.isPrimary ?? firstPost);
  const [onTimeClock, setOnTimeClock] = useState(post?.showOnTimeClock ?? false);
  const [poll, setPoll] = useState<PollDraft | null>(
    post?.poll
      ? {
          question: post.poll.question,
          options: post.poll.options.map((option) => option.label),
          allowsMultiple: post.poll.allowsMultiple,
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryLocked = firstPost || post?.isPrimary === true;
  /// Once anybody has voted the choices are fixed; the question can still be
  /// reworded.
  const votesIn = (post?.poll?.voterCount ?? 0) > 0;
  const pollInput = poll ? cleanPoll(poll) : null;
  const pollReady =
    pollInput !== null && pollInput.question.length >= 2 && pollInput.options.length >= 2;
  const canSave = title.trim().length >= 2 && (poll ? pollReady : body.trim() !== '');

  async function draft() {
    setAiBusy('draft');
    setError(null);
    try {
      const words = await api.draftAnnouncement(notes.trim(), title.trim() || undefined);
      setTitle(words.title);
      setBody(words.body);
      setHelping(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not write that just now.');
    } finally {
      setAiBusy(null);
    }
  }

  async function translate() {
    setAiBusy('translate');
    setError(null);
    try {
      const words = await api.translateAnnouncement(title.trim(), body.trim());
      setTitleEs(words.title);
      setBodyEs(words.body);
      setSpanishByAi(true);
      setSpanishTouched(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not translate that just now.');
    } finally {
      setAiBusy(null);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const englishChanged =
        post !== undefined && (title.trim() !== post.title || body.trim() !== post.body);
      const spanish =
        englishChanged && !spanishTouched
          ? { titleEs: '' }
          : { titleEs: titleEs.trim(), bodyEs: bodyEs.trim(), spanishByAi };
      const payload = { title: title.trim(), body: body.trim(), ...spanish };
      if (post) {
        await api.updateAnnouncement(post.id, {
          ...payload,
          ...(isPrimary && !post.isPrimary ? { isPrimary: true } : {}),
          ...(onTimeClock !== post.showOnTimeClock ? { showOnTimeClock: onTimeClock } : {}),
          // Only when there is something to say about it: a post that never
          // had a poll and still has none leaves the field out.
          ...(pollInput ? { poll: pollInput } : post.poll ? { poll: null } : {}),
        });
      } else {
        await api.createAnnouncement({
          ...payload,
          isPrimary,
          showOnTimeClock: onTimeClock,
          ...(pollInput ? { poll: pollInput } : {}),
        });
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
        {aiOn && (
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
            {helping ? (
              <div className="space-y-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    What should it say? Rough notes are fine.
                  </span>
                  <textarea
                    aria-label="Notes for the post"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder="WNY closing early fri 2pm, power company work, NB open as usual"
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={aiBusy !== null || notes.trim().length < 3}
                    onClick={() => void draft()}
                    className={buttonClass('secondary', 'sm')}
                  >
                    {aiBusy === 'draft' ? 'Writing…' : 'Write it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelping(false)}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Close
                  </button>
                </div>
                <p className="text-xs text-slate-500">{AI_NOTE}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHelping(true)}
                className="text-sm font-medium text-brand-700 hover:text-brand-900"
              >
                ✨ Help me write it
              </button>
            )}
          </div>
        )}

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
          <span className="mb-1 block font-medium text-slate-700">
            Message
            {poll && <span className="font-normal text-slate-500"> (optional with a poll)</span>}
          </span>
          <textarea
            aria-label="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            maxLength={10_000}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>

        <PollEditor poll={poll} votesIn={votesIn} onChange={setPoll} />

        <details
          className="rounded-lg ring-1 ring-inset ring-slate-200"
          open={Boolean(post?.titleEs) || undefined}
        >
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
            In Spanish{' '}
            <span className="font-normal text-slate-500">
              (optional — for staff who read the news in Español)
            </span>
          </summary>
          <div className="space-y-2 px-3 pb-3">
            {aiOn && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={aiBusy !== null || title.trim().length < 2}
                  onClick={() => void translate()}
                  className={buttonClass('secondary', 'sm')}
                >
                  {aiBusy === 'translate' ? 'Translating…' : '✨ Translate from the English'}
                </button>
                <span className="text-xs text-slate-500">
                  Left empty, it is translated automatically the first time somebody asks.
                </span>
              </div>
            )}
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Título</span>
              <input
                aria-label="Título en español"
                lang="es"
                value={titleEs}
                onChange={(event) => {
                  setTitleEs(event.target.value);
                  setSpanishByAi(false);
                  setSpanishTouched(true);
                }}
                maxLength={160}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Mensaje</span>
              <textarea
                aria-label="Mensaje en español"
                lang="es"
                value={bodyEs}
                onChange={(event) => {
                  setBodyEs(event.target.value);
                  setSpanishByAi(false);
                  setSpanishTouched(true);
                }}
                rows={5}
                maxLength={12_000}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
            {spanishByAi && titleEs && (
              <p className="text-xs text-slate-500">
                Translated by the AI service — shown to staff as &ldquo;Traducido
                automáticamente&rdquo; until somebody edits it.
              </p>
            )}
          </div>
        </details>

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

        <div className="flex items-start gap-2 text-sm">
          <input
            id="post-on-time-clock"
            type="checkbox"
            checked={onTimeClock}
            onChange={(event) => setOnTimeClock(event.target.checked)}
            aria-describedby="post-on-time-clock-hint"
            className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <div>
            {/* The hint is described-by, not inside the label: its words would
                otherwise become part of the box's name. */}
            <label htmlFor="post-on-time-clock" className="font-medium text-slate-700">
              Show publicly — on the time clock and the sign-in page
            </label>
            <p id="post-on-time-clock-hint" className="text-xs text-slate-500">
              It goes on the front-desk time clock, where patients can see it, and under the sign-in
              form, which anyone on the internet can open. Leave this off for anything internal.
              Only the title and message are shown there — no likes, comments or poll.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() => void save()}
          className={buttonClass('primary', 'md')}
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

interface PollDraft {
  question: string;
  options: string[];
  allowsMultiple: boolean;
}

/// Most choices a poll can have (the API's limit too).
const MAX_POLL_OPTIONS = 10;

/// What is sent: trimmed, with the empty choice boxes left out.
function cleanPoll(draft: PollDraft): PollInput {
  return {
    question: draft.question.trim(),
    options: draft.options.map((option) => option.trim()).filter((option) => option !== ''),
    allowsMultiple: draft.allowsMultiple,
  };
}

/// Adding a poll to a post: a question, two to ten choices, and whether
/// people may pick more than one. Once anybody has voted, only the question
/// can change — the choices are what they voted on.
function PollEditor({
  poll,
  votesIn,
  onChange,
}: {
  poll: PollDraft | null;
  votesIn: boolean;
  onChange: (poll: PollDraft | null) => void;
}) {
  if (!poll) {
    return (
      <button
        type="button"
        onClick={() => onChange({ question: '', options: ['', ''], allowsMultiple: false })}
        className={buttonClass('secondary', 'sm')}
      >
        + Add a poll
      </button>
    );
  }

  const setOption = (index: number, value: string) =>
    onChange({ ...poll, options: poll.options.map((option, i) => (i === index ? value : option)) });

  return (
    <fieldset
      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
      data-testid="poll-editor"
    >
      <legend className="px-1 text-sm font-medium text-slate-700">Poll</legend>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Question</span>
        <input
          aria-label="Poll question"
          value={poll.question}
          maxLength={200}
          onChange={(event) => onChange({ ...poll, question: event.target.value })}
          placeholder="Which day suits you for the holiday party?"
          className={inputClass}
        />
      </label>

      {votesIn ? (
        <p className="text-xs text-slate-600">
          People have voted, so the choices stay as they are:{' '}
          <strong className="font-medium">{poll.options.join(' · ')}</strong>. To stop the voting,
          use <strong className="font-medium">Close voting</strong> on the post.
        </p>
      ) : (
        <>
          <ol className="space-y-2">
            {poll.options.map((option, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  aria-label={`Choice ${index + 1}`}
                  value={option}
                  maxLength={100}
                  onChange={(event) => setOption(index, event.target.value)}
                  placeholder={`Choice ${index + 1}`}
                  className={inputClass}
                />
                {poll.options.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove choice ${index + 1}`}
                    onClick={() =>
                      onChange({ ...poll, options: poll.options.filter((_, i) => i !== index) })
                    }
                    className="tap px-2 text-slate-500 hover:text-rose-700"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            {poll.options.length < MAX_POLL_OPTIONS && (
              <button
                type="button"
                onClick={() => onChange({ ...poll, options: [...poll.options, ''] })}
                className="tap text-sm font-medium text-brand-700 hover:text-brand-900"
              >
                + Add a choice
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={poll.allowsMultiple}
                onChange={(event) => onChange({ ...poll, allowsMultiple: event.target.checked })}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              People can pick more than one
            </label>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="tap text-xs font-medium text-slate-500 hover:text-rose-700"
          >
            Remove the poll
          </button>
        </>
      )}
      <p className="text-xs text-slate-500">
        Votes are named: everybody sees who picked what. For anonymous answers, use a survey.
      </p>
    </fieldset>
  );
}
