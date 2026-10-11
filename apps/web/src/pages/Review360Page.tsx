import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import {
  Alert,
  Badge,
  Card,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { useIsManager } from '../lib/session';
import type { Review360Detail, Review360Person } from '../lib/types';

/**
 * 360 feedback, answering (October 2026, Dominguez). Everybody in it says how
 * each colleague is doing — and how they are doing themselves — on a few 1–5
 * ratings and two written answers, or passes somebody over. Each person once:
 * nothing links an answer back to who gave it, so it cannot be changed after.
 */
export function Review360Page() {
  const { id = '' } = useParams();
  const t = useT();
  const isManager = useIsManager();
  const [review, setReview] = useState<Review360Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<Review360Person | null>(null);

  const load = useCallback(async () => {
    try {
      setReview(await api.review360(id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('Could not load it.'));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!review) return <Spinner label={t('Loading')} />;

  const done = review.people.filter((person) => person.state !== 'todo').length;
  const open = review.status === 'OPEN';

  return (
    <div className="max-w-3xl">
      <PageHeading title={review.title} subtitle={t('360 feedback')} />

      {review.intro && (
        <p className="mb-3 whitespace-pre-line text-sm text-slate-700">{review.intro}</p>
      )}

      <Card className="mb-4 p-4" testId="review360-anonymous">
        <p className="text-sm text-slate-800">
          {t(
            'Say how each colleague is doing, and how you are. Skip anybody you do not work with enough.',
          )}
        </p>
        <details className="mt-2 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-brand-700">
            {t('Is it really anonymous?')}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              {t(
                'What you say about somebody is saved with their name, never yours, and with no time.',
              )}
            </li>
            <li>
              {t(
                'The app keeps, separately, that you have done somebody — so you cannot do them twice. It never links that to what you said.',
              )}
            </li>
            <li>
              {t(
                'Only managers and admins see a person’s report, once it has closed, and only if at least {n} colleagues rated them. Written answers are shown in a random order.',
                { n: String(review.minRaters) },
              )}
            </li>
            <li>
              {t('Write so the words could have come from anybody — that part is up to you.')}
            </li>
          </ul>
        </details>
        {review.closesOn && open && (
          <p className="mt-2 text-xs text-slate-600">
            {t('Open until {date}.', { date: formatCalendarDate(review.closesOn) })}
          </p>
        )}
      </Card>

      {!open && (
        <div className="mb-4">
          <Alert tone="info">{t('This 360 has closed. Thank you for taking part.')}</Alert>
        </div>
      )}

      {!review.takingPart ? (
        <Alert tone="info">
          {t('You are not in this one — it is for the people here when it started.')}
          {isManager && (
            <>
              {' '}
              <Link to={`/surveys/360/${review.id}/reports`} className="font-medium underline">
                Reports
              </Link>
            </>
          )}
        </Alert>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-700" data-testid="review360-progress">
            {t('{done} of {total} done', {
              done: String(done),
              total: String(review.people.length),
            })}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="review360-people">
            {review.people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={!open || person.state !== 'todo'}
                  onClick={() => setRating(person)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-brand-400 disabled:cursor-default disabled:opacity-70 disabled:hover:border-slate-200"
                >
                  <Avatar
                    person={{
                      id: person.id,
                      firstName: person.firstName,
                      lastName: person.name.split(' ').slice(-1)[0] ?? '',
                      photoUpdatedAt: person.photoUpdatedAt,
                    }}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {person.isYou ? t('You') : person.name}
                    </span>
                    {person.jobRole && !person.isYou && (
                      <span className="block truncate text-xs text-slate-600">
                        {person.jobRole}
                      </span>
                    )}
                    {person.isYou && (
                      <span className="block text-xs text-slate-600">
                        {t('How you think you are doing')}
                      </span>
                    )}
                  </span>
                  {person.state === 'done' && <Badge tone="success">{t('Done')}</Badge>}
                  {person.state === 'skipped' && <Badge>{t('Skipped')}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {rating && (
        <RateDialog
          review={review}
          person={rating}
          onClose={() => setRating(null)}
          onSaved={() => {
            setRating(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RateDialog({
  review,
  person,
  onClose,
  onSaved,
}: {
  review: Review360Detail;
  person: Review360Person;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const answered =
    Object.keys(ratings).length + Object.values(texts).filter((text) => text.trim()).length;

  async function send(skip: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      await api.answerReview360(review.id, {
        subjectId: person.id,
        skip,
        answers: skip
          ? undefined
          : review.questions.map((question) =>
              question.kind === 'RATING'
                ? { questionId: question.id, rating: ratings[question.id] ?? null }
                : { questionId: question.id, text: texts[question.id]?.trim() || null },
            ),
      });
      onSaved();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : t('That did not save.'));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={person.isYou ? t('About you') : person.name}
      onClose={onClose}
      wide
      testId="review360-rate"
    >
      <div className="space-y-4">
        {review.questions.map((question) => {
          const prompt = person.isYou ? (question.selfPrompt ?? question.prompt) : question.prompt;
          return (
            <fieldset key={question.id}>
              <legend className="text-sm font-medium text-slate-900">
                {question.hint && (
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {question.hint} ·
                  </span>
                )}
                {prompt}
              </legend>
              {question.kind === 'RATING' ? (
                <div className="mt-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={ratings[question.id] === value}
                        aria-label={`${prompt}: ${value}`}
                        onClick={() =>
                          setRatings((current) => {
                            const next = { ...current };
                            if (next[question.id] === value) delete next[question.id];
                            else next[question.id] = value;
                            return next;
                          })
                        }
                        className={`h-10 w-10 rounded-lg border text-sm font-semibold ${
                          ratings[question.id] === value
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <p className="mt-0.5 flex max-w-[13.5rem] justify-between text-xs text-slate-500">
                    <span>{t('Rarely')}</span>
                    <span>{t('Always')}</span>
                  </p>
                </div>
              ) : (
                <textarea
                  aria-label={prompt}
                  rows={2}
                  maxLength={1000}
                  value={texts[question.id] ?? ''}
                  onChange={(event) =>
                    setTexts((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                  className={`mt-1 ${inputClass}`}
                />
              )}
            </fieldset>
          );
        })}

        <p className="text-xs text-slate-600">
          {t('Once saved it cannot be changed: nothing links it back to you.')}
        </p>
        {problem && <Alert>{problem}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || answered === 0}
            onClick={() => void send(false)}
            className={buttonClass('primary', 'md')}
          >
            {busy ? t('Saving…') : t('Save')}
          </button>
          {!person.isYou && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(true)}
              className={buttonClass('secondary', 'md')}
            >
              {t('Skip — I don’t work with them enough')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
