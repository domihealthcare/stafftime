import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { practiceDate } from '../lib/practice-time';
import { useIsManager } from '../lib/session';
import type { Review360QuestionInput, Review360Summary } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Badge, Card, buttonClass, inputClass } from './ui';

/**
 * 360 feedback on the Surveys page (October 2026, Dominguez): for everybody,
 * an open 360 and how far they have got; for managers, starting one - the
 * starter questions, changeable - closing it, and its reports.
 */
export function Reviews360Section() {
  const t = useT();
  const isManager = useIsManager();
  const confirm = useConfirm();
  const [reviews, setReviews] = useState<Review360Summary[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReviews(await api.reviews360());
    } catch {
      setReviews([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not work.');
    }
  }

  const mine = reviews.filter((review) => review.status === 'OPEN' && review.mine);
  if (!isManager && mine.length === 0) return null;
  const open = reviews.some((review) => review.status === 'OPEN');

  return (
    <section aria-label={t('360 feedback')} className="mb-8" data-testid="reviews360">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {t('360 feedback')}
      </h2>

      {mine.map((review) => (
        <Card key={review.id} className="mb-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{review.title}</p>
              <p className="text-sm text-slate-600">
                {t('{done} of {total} done', {
                  done: String(review.mine!.done),
                  total: String(review.mine!.total),
                })}
                {review.closesOn &&
                  ` · ${t('Open until {date}.', { date: formatCalendarDate(review.closesOn) })}`}
              </p>
            </div>
            <Link to={`/surveys/360/${review.id}`} className={buttonClass('primary', 'sm')}>
              {review.mine!.done === 0 ? t('Start') : t('Carry on')}
            </Link>
          </div>
        </Card>
      ))}

      {isManager && (
        <Card className="p-4" testId="reviews360-manage">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 text-sm text-slate-600">
              Everybody rates everybody - and themselves - anonymously. Reports are for managers and
              admins only, once it closes; from a report you offer times to talk it through.
            </p>
            {!open && !starting && (
              <button
                type="button"
                onClick={() => setStarting(true)}
                className={buttonClass('primary', 'sm')}
              >
                Start a 360
              </button>
            )}
          </div>
          {error && (
            <div className="mt-2">
              <Alert>{error}</Alert>
            </div>
          )}
          {starting && (
            <StartForm
              onCancel={() => setStarting(false)}
              onStarted={() => {
                setStarting(false);
                void load();
              }}
            />
          )}
          {reviews.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100">
              {reviews.map((review) => (
                <li key={review.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{review.title}</span>{' '}
                    {review.status === 'OPEN' ? (
                      <Badge tone="success">Open</Badge>
                    ) : (
                      <Badge>Closed</Badge>
                    )}
                    <span className="block text-xs text-slate-600">
                      {review.tookPart ?? 0} of {review.people} have taken part
                      {review.status === 'OPEN' && review.closesOn
                        ? ` · closes ${formatCalendarDate(review.closesOn)}`
                        : ''}
                      {review.closedAt ? ` · closed ${formatCalendarDate(review.closedAt)}` : ''}
                    </span>
                  </span>
                  {review.status === 'OPEN' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void (async () => {
                          const sure = await confirm({
                            title: 'Close this 360?',
                            body: 'Nobody can add to it after. The reports become ready.',
                            confirmLabel: 'Close it',
                            cancelLabel: 'Keep it open',
                            tone: 'neutral',
                          });
                          if (sure) await act(() => api.closeReview360(review.id));
                        })()
                      }
                      className={buttonClass('secondary', 'sm')}
                    >
                      Close
                    </button>
                  ) : (
                    <Link
                      to={`/surveys/360/${review.id}/reports`}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Reports
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void (async () => {
                        const sure = await confirm({
                          title: `Remove “${review.title}”?`,
                          body: 'Everything said in it, its reports and any times offered go for good.',
                          confirmLabel: 'Yes, remove',
                          cancelLabel: 'Keep it',
                        });
                        if (sure) await act(() => api.deleteReview360(review.id));
                      })()
                    }
                    className="text-sm text-slate-600 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  );
}

function StartForm({ onCancel, onStarted }: { onCancel: () => void; onStarted: () => void }) {
  const [title, setTitle] = useState(`360 feedback - ${new Date().getFullYear()}`);
  const [intro, setIntro] = useState('');
  const [closesOn, setClosesOn] = useState(practiceDate(new Date(Date.now() + 14 * 86_400_000)));
  const [questions, setQuestions] = useState<Review360QuestionInput[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api
      .review360Starter()
      .then((starter) => setQuestions(starter.questions))
      .catch(() => setQuestions([]));
  }, []);

  function change(index: number, patch: Partial<Review360QuestionInput>) {
    setQuestions(
      (current) =>
        current &&
        current.map((question, i) => (i === index ? { ...question, ...patch } : question)),
    );
  }

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!questions) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.createReview360({
        title: title.trim(),
        intro: intro.trim() || null,
        closesOn: closesOn || null,
        questions: questions.map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          selfPrompt: question.selfPrompt?.trim() || null,
          hint: question.hint?.trim() || null,
        })),
      });
      onStarted();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not start it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void start(event)}
      className="mt-3 space-y-3"
      data-testid="start-360"
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Title</span>
        <input
          required
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">A few words for everybody (optional)</span>
        <textarea
          rows={2}
          value={intro}
          maxLength={2000}
          onChange={(event) => setIntro(event.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Closes by itself on (optional)</span>
        <input
          type="date"
          value={closesOn}
          min={practiceDate()}
          onChange={(event) => setClosesOn(event.target.value)}
          className={`mt-1 ${inputClass} w-auto`}
        />
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          Questions - asked about each colleague, and about yourself
        </legend>
        {!questions ? (
          <p className="text-sm text-slate-500">Loading the starter questions…</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {questions.map((question, index) => (
              <li key={index} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Question ${index + 1}: kind`}
                    value={question.kind}
                    onChange={(event) =>
                      change(index, { kind: event.target.value as Review360QuestionInput['kind'] })
                    }
                    className={`${inputClass} w-auto`}
                  >
                    <option value="RATING">1 to 5</option>
                    <option value="TEXT">Written answer</option>
                  </select>
                  <input
                    aria-label={`Question ${index + 1}: short name`}
                    placeholder="Short name (optional)"
                    value={question.hint ?? ''}
                    maxLength={100}
                    onChange={(event) => change(index, { hint: event.target.value })}
                    className={`${inputClass} w-40`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setQuestions((current) => current && current.filter((_, i) => i !== index))
                    }
                    className="ml-auto text-sm text-slate-600 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </div>
                <input
                  aria-label={`Question ${index + 1}: about a colleague`}
                  required
                  placeholder="About a colleague"
                  value={question.prompt}
                  maxLength={200}
                  onChange={(event) => change(index, { prompt: event.target.value })}
                  className={`mt-2 ${inputClass}`}
                />
                <input
                  aria-label={`Question ${index + 1}: about yourself`}
                  placeholder="About yourself (optional - the same words otherwise)"
                  value={question.selfPrompt ?? ''}
                  maxLength={200}
                  onChange={(event) => change(index, { selfPrompt: event.target.value })}
                  className={`mt-2 ${inputClass}`}
                />
              </li>
            ))}
          </ol>
        )}
        {questions && questions.length < 15 && (
          <button
            type="button"
            onClick={() =>
              setQuestions((current) => [
                ...(current ?? []),
                { kind: 'RATING', prompt: '', selfPrompt: '', hint: '' },
              ])
            }
            className="mt-2 text-sm font-medium text-brand-700 hover:underline"
          >
            + Add a question
          </button>
        )}
      </fieldset>

      <p className="text-xs text-slate-600">
        Everybody here now is asked, and told under the bell. The questions cannot change once it
        starts.
      </p>
      {problem && <Alert>{problem}</Alert>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !questions || questions.length === 0}
          className={buttonClass('primary', 'sm')}
        >
          {busy ? 'Starting…' : 'Start it'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
