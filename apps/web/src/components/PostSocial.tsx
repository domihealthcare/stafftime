import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { displayName } from '../lib/format';
import { locale, plural, t as translate, useT } from '../lib/i18n';
import { useIsManager, useSession } from '../lib/session';
import type { Announcement, AnnouncementComment, PersonName } from '../lib/types';
import { Avatar } from './Avatar';
import { useConfirm } from './ConfirmDialog';
import { HoverNote } from './HoverNote';
import { Alert, buttonClass, inputClass } from './ui';

/**
 * Likes, comments and polls on a News post (October 2026, Dominguez).
 *
 * All three are named on purpose: a like says who, a comment is under the
 * writer's name, and a poll shows who picked what. That is the difference
 * from a pulse survey, which is truly anonymous — so the poll says so in
 * plain words where people vote.
 *
 * Every change comes back from the server as the whole post, for this reader,
 * and is handed up through `onChange` to replace the old one.
 */

const MAX_COMMENT = 2_000;

/// "Angelica Diaz, Maria Ruiz and 3 others" — the others in a note on the
/// words, so a long list does not crowd the line.
function Names({ people, testId }: { people: PersonName[]; testId?: string }) {
  const t = useT();
  const names = people.map(displayName);
  if (names.length <= 3) {
    return <span data-testid={testId}>{joinNames(names)}</span>;
  }
  const rest = names.slice(2);
  return (
    <span data-testid={testId}>
      {t('{names} and', { names: names.slice(0, 2).join(', ') })}{' '}
      <HoverNote note={rest.join(', ')}>{t('{n} others', { n: rest.length })}</HoverNote>
    </span>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return translate('{names} and {last}', {
    names: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  });
}

// ------------------------------------------------------------------- likes

export function LikeButton({
  post,
  onChange,
}: {
  post: Announcement;
  onChange: (post: Announcement) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={post.likedByMe}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onChange(await api.likeAnnouncement(post.id, !post.likedByMe));
        } catch {
          // A like that did not land is not worth an error: the heart simply
          // stays as it was, which says so.
        } finally {
          setBusy(false);
        }
      }}
      className={`tap inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium ${
        post.likedByMe ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span aria-hidden="true">{post.likedByMe ? '♥' : '♡'}</span>
      {post.likedByMe ? t('Liked') : t('Like')}
    </button>
  );
}

/// Who liked it, by name. Nothing until somebody has.
export function LikedBy({ post }: { post: Announcement }) {
  const t = useT();
  if (post.likes.length === 0) return null;
  return (
    <p className="text-xs text-slate-600">
      <span aria-hidden="true" className="text-rose-600">
        ♥{' '}
      </span>
      {t('Liked by')} <Names people={post.likes} testId="liked-by" />
    </p>
  );
}

// ------------------------------------------------------------------- polls

/// The poll, its choices and everybody's picks by name. A tap on a choice is
/// the vote — there is no separate button to forget — and a tap on another
/// changes it.
export function PollView({
  post,
  onChange,
}: {
  post: Announcement;
  onChange: (post: Announcement) => void;
}) {
  const t = useT();
  const { employee } = useSession();
  const isAdmin = employee?.role === 'ADMIN';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /// The picks just tapped, shown at once while the server saves them, so a
  /// choice looks chosen the moment it is tapped. Cleared when the answer
  /// comes back — with the saved picks, or as they were if it failed.
  const [pending, setPending] = useState<string[] | null>(null);
  const poll = post.poll;
  if (!poll) return null;
  const { allowsMultiple } = poll;

  const closed = poll.closedAt !== null;
  const mine = new Set(pending ?? poll.myChoices);
  const most = Math.max(1, ...poll.options.map((option) => option.voters.length));

  async function send(change: () => Promise<Announcement>, picks: string[] | null = null) {
    setBusy(true);
    setError(null);
    setPending(picks);
    try {
      onChange(await change());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('Could not save your vote.'));
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  function pick(optionId: string, ticked: boolean) {
    const next = allowsMultiple
      ? ticked
        ? [...mine, optionId]
        : [...mine].filter((id) => id !== optionId)
      : [optionId];
    void send(() => api.voteInPoll(post.id, next), next);
  }

  return (
    <fieldset
      className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      data-testid="poll"
      disabled={busy}
    >
      <legend className="sr-only">{t('Poll: {question}', { question: poll.question })}</legend>
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
        {t('Poll')}
        {closed ? t(' · voting closed') : ''}
      </p>
      <p className="mt-0.5 font-medium text-slate-900">{poll.question}</p>
      <p className="text-xs text-slate-500">
        {closed
          ? t('Closed.')
          : poll.allowsMultiple
            ? t('Pick any that suit you.')
            : t('Pick one.')}
      </p>

      <ul className="mt-2 space-y-2">
        {poll.options.map((option) => {
          const count = option.voters.length;
          const chosen = mine.has(option.id);
          return (
            <li key={option.id} data-testid="poll-option">
              <label
                className={`relative flex min-h-11 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-sm ${
                  chosen ? 'border-brand-600 bg-white' : 'border-slate-200 bg-white'
                } ${closed ? 'cursor-default' : 'hover:border-brand-400'}`}
              >
                {/* The bar behind the words: share of the most-picked choice. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 ${chosen ? 'bg-brand-100' : 'bg-slate-100'}`}
                  style={{ width: `${(count / most) * 100}%` }}
                />
                <input
                  type={poll.allowsMultiple ? 'checkbox' : 'radio'}
                  name={`poll-${poll.id}`}
                  checked={chosen}
                  disabled={closed}
                  onChange={(event) => pick(option.id, event.target.checked)}
                  className="relative text-brand-600 focus:ring-brand-600"
                />
                <span className="relative flex-1 font-medium text-slate-800">{option.label}</span>
                <span className="relative text-xs font-semibold text-slate-700">
                  {plural(count, '{n} vote', '{n} votes')}
                </span>
              </label>
              {count > 0 && (
                <p className="mt-0.5 px-1 text-xs text-slate-600">
                  <Names people={option.voters} />
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-slate-600">
        {poll.voterCount === 0
          ? t('Nobody has voted yet.')
          : plural(poll.voterCount, '{n} person has voted.', '{n} people have voted.')}{' '}
        <strong className="font-medium">{t('Votes are not anonymous')}</strong>
        {t(' — everybody can see who picked what.')}
      </p>

      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!closed && mine.size > 0 && (
          <button
            type="button"
            onClick={() => void send(() => api.voteInPoll(post.id, []), [])}
            className="tap text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {t('Take my vote back')}
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => void send(() => api.setPollClosed(post.id, !closed))}
            className={buttonClass('secondary', 'sm')}
          >
            {closed ? t('Open voting again') : t('Close voting')}
          </button>
        )}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- comments

/// How many comments show before "Show all".
const SHOWN_COMMENTS = 3;

/// The comments under a post, oldest first, and a box to add one. A long
/// conversation shows its latest few until opened.
export function PostComments({
  post,
  onChange,
  composing,
  onComposingChange,
}: {
  post: Announcement;
  onChange: (post: Announcement) => void;
  composing: boolean;
  onComposingChange: (open: boolean) => void;
}) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const hidden = showAll ? 0 : Math.max(0, post.comments.length - SHOWN_COMMENTS);
  const shown = post.comments.slice(hidden);

  if (post.comments.length === 0 && !composing) return null;

  return (
    <section aria-label={t('Comments')} className="mt-3 space-y-3" data-testid="comments">
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="tap text-xs font-medium text-brand-700 hover:text-brand-900"
        >
          {t('Show all {n} comments', { n: post.comments.length })}
        </button>
      )}
      {shown.length > 0 && (
        <ul className="space-y-3">
          {shown.map((comment) => (
            <CommentItem key={comment.id} post={post} comment={comment} onChange={onChange} />
          ))}
        </ul>
      )}
      {composing && (
        <CommentBox
          label={t('Write a comment')}
          submitLabel={t('Post comment')}
          autoFocus
          onSubmit={(text) => api.commentOnAnnouncement(post.id, text)}
          onDone={(updated) => {
            if (updated) onChange(updated);
            onComposingChange(false);
          }}
        />
      )}
    </section>
  );
}

function CommentItem({
  post,
  comment,
  onChange,
}: {
  post: Announcement;
  comment: AnnouncementComment;
  onChange: (post: Announcement) => void;
}) {
  const t = useT();
  const { employee } = useSession();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = employee?.id === comment.author.id;

  if (editing) {
    return (
      <li>
        <CommentBox
          label={t('Change your comment')}
          submitLabel={t('Save')}
          initial={comment.body}
          autoFocus
          onSubmit={(text) => api.editAnnouncementComment(post.id, comment.id, text)}
          onDone={(updated) => {
            if (updated) onChange(updated);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex gap-2" data-testid="comment">
      <Avatar person={comment.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="rounded-xl bg-slate-100 px-3 py-2">
          <p className="text-xs font-semibold text-slate-900">{displayName(comment.author)}</p>
          <p className="whitespace-pre-line break-words text-sm text-slate-800">{comment.body}</p>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 px-1 text-xs text-slate-500">
          <span>
            {formatWhen(comment.createdAt)}
            {comment.editedAt && t(' · edited')}
          </span>
          {own && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap font-medium text-slate-600 hover:text-slate-900"
            >
              {t('Edit')}
            </button>
          )}
          {(own || isManager) && (
            <button
              type="button"
              onClick={async () => {
                const sure = await confirm({
                  title: own
                    ? t('Delete your comment?')
                    : t('Delete {name}’s comment?', { name: displayName(comment.author) }),
                  body: own
                    ? t('It goes from the post for everybody.')
                    : t('It goes from the post for everybody. They are not told.'),
                  confirmLabel: t('Delete it'),
                  cancelLabel: t('Keep it'),
                });
                if (!sure) return;
                try {
                  setError(null);
                  onChange(await api.deleteAnnouncementComment(post.id, comment.id));
                } catch (cause) {
                  setError(cause instanceof ApiError ? cause.message : t('Could not delete that.'));
                }
              }}
              className="tap font-medium text-slate-600 hover:text-rose-700"
            >
              {t('Delete')}
            </button>
          )}
        </p>
        {error && (
          <div className="mt-1">
            <Alert>{error}</Alert>
          </div>
        )}
      </div>
    </li>
  );
}

/// Writing a comment, or changing one. Says plainly who will read it, because
/// this is the one place on News where anybody can type.
function CommentBox({
  label,
  submitLabel,
  initial = '',
  autoFocus = false,
  onSubmit,
  onDone,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<Announcement>;
  onDone: (updated: Announcement | null) => void;
}) {
  const t = useT();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onDone(await onSubmit(text.trim()));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('Could not save your comment.'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="sr-only">{label}</span>
        <textarea
          ref={box}
          aria-label={label}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          maxLength={MAX_COMMENT}
          placeholder={t('Write a comment…')}
          className={inputClass}
        />
      </label>
      <p className="text-xs text-slate-500">
        {t('Everybody signed in can read it, under your name. Never anything about a patient.')}
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || text.trim() === ''}
          onClick={() => void submit()}
          className={buttonClass('primary', 'sm')}
        >
          {busy ? t('Saving…') : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="tap text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}

/// "Oct 3, 2:15 PM" — with the year only when it is not this one.
function formatWhen(iso: string): string {
  const date = new Date(iso);
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(locale(), {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------- the action row

/// Like, Comment, and who liked it — under a post on News and on Home.
export function PostActions({
  post,
  onChange,
  onComment,
}: {
  post: Announcement;
  onChange: (post: Announcement) => void;
  /// What "Comment" does: open the box here, or go to the post on News.
  onComment: () => void;
}) {
  const t = useT();
  const count = post.comments.length;
  return (
    <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
      <LikedBy post={post} />
      <div className="flex flex-wrap items-center gap-1">
        <LikeButton post={post} onChange={onChange} />
        <button
          type="button"
          onClick={onComment}
          className="tap inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">💬</span>
          {t('Comment')}
        </button>
        {count > 0 && (
          <span className="ml-auto text-xs text-slate-500">
            {plural(count, '{n} comment', '{n} comments')}
          </span>
        )}
      </div>
    </div>
  );
}
