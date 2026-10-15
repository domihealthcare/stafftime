import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useT } from '../lib/i18n';
import type {
  EventReplies as Replies,
  PracticeEvent,
  ReplyAnswer,
  ReplyPerson,
} from '../lib/types';
import { Alert } from './ui';

/**
 * Going, can't go or maybe — in a meeting's pop-up (October 2026, Dominguez).
 *
 * The people it is for answer here; everybody it is for (and managers) sees
 * who is going, who can't, who might and who has not said yet, like a
 * calendar invite. Each date of a series is answered on its own; a new time
 * clears the answers. Only meetings — never closures, holidays, diagnostics
 * or rep lunches.
 */
export function EventReplies({
  event,
  onAnswered,
}: {
  event: PracticeEvent;
  /// The viewer's new answer, so the chip behind can show it.
  onAnswered?: (answer: ReplyAnswer) => void;
}) {
  const t = useT();
  const [replies, setReplies] = useState<Replies | null>(null);
  const [busy, setBusy] = useState<ReplyAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setReplies(null);
    api
      .eventReplies(event.id)
      .then((found) => live && setReplies(found))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : null));
    return () => {
      live = false;
    };
  }, [event.id]);

  async function answer(next: ReplyAnswer) {
    setBusy(next);
    setError(null);
    try {
      const updated = await api.replyToEvent(event.id, next);
      setReplies(updated);
      onAnswered?.(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not save your answer.'));
    } finally {
      setBusy(null);
    }
  }

  if (!replies) {
    return error ? (
      <div className="mt-3">
        <Alert>{error}</Alert>
      </div>
    ) : null;
  }

  const choices: { value: ReplyAnswer; label: string; on: string }[] = [
    { value: 'GOING', label: t('Going'), on: 'bg-emerald-600 text-white ring-emerald-600' },
    { value: 'MAYBE', label: t('Maybe'), on: 'bg-amber-500 text-white ring-amber-500' },
    { value: 'NOT_GOING', label: t('Can’t go'), on: 'bg-rose-600 text-white ring-rose-600' },
  ];
  const total =
    replies.going.length + replies.maybe.length + replies.notGoing.length + replies.waiting.length;

  return (
    <section className="mt-3 border-t border-slate-100 pt-3" data-testid="event-replies">
      {replies.canReply && (
        <div className="mb-3">
          <h3 className="mb-1.5 text-sm font-medium text-slate-800" id={`reply-${event.id}`}>
            {t('Are you going?')}
          </h3>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`reply-${event.id}`}>
            {choices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={replies.mine === choice.value}
                disabled={busy !== null}
                onClick={() => void answer(choice.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset disabled:opacity-60 max-sm:py-2.5 ${
                  replies.mine === choice.value
                    ? choice.on
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {busy === choice.value ? t('Saving…') : choice.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-2">
          <Alert>{error}</Alert>
        </div>
      )}

      <dl className="space-y-1.5 text-sm" aria-label={t('Who is going')}>
        <Group label={t('Going')} people={replies.going} testId="replies-going" />
        <Group label={t('Maybe')} people={replies.maybe} testId="replies-maybe" />
        <Group label={t('Can’t go')} people={replies.notGoing} testId="replies-not-going" />
        <Group
          label={t('Not answered yet')}
          people={replies.waiting}
          testId="replies-waiting"
          folded={replies.waiting.length > 6}
        />
      </dl>
      {total === 0 && (
        <p className="text-xs text-slate-500">{t('Nobody is on the list any more.')}</p>
      )}
    </section>
  );
}

function Group({
  label,
  people,
  testId,
  folded = false,
}: {
  label: string;
  people: ReplyPerson[];
  testId: string;
  /// A long "not answered yet" list starts as a count.
  folded?: boolean;
}) {
  const t = useT();
  if (people.length === 0) return null;
  const names = people.map((person) => person.name).join(', ');
  return (
    <div data-testid={testId}>
      <dt className="inline font-medium text-slate-700">
        {label} ({people.length}):{' '}
      </dt>
      <dd className="inline text-slate-700">
        {folded ? (
          <details className="inline">
            <summary className="inline cursor-pointer text-brand-700 underline">
              {t('Show who')}
            </summary>
            <span className="block">{names}</span>
          </details>
        ) : (
          names
        )}
      </dd>
    </div>
  );
}

/// A mark on a meeting's chip for the viewer's own answer.
export const REPLY_MARK: Record<ReplyAnswer, { mark: string; words: string }> = {
  GOING: { mark: '✓', words: 'you’re going' },
  MAYBE: { mark: '?', words: 'you might go' },
  NOT_GOING: { mark: '✗', words: 'you can’t go' },
};
