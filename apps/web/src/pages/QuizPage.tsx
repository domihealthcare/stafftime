import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dueLabel } from '../components/RequiredItems';
import { Alert, Badge, Card, PageHeading, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { useIsManager } from '../lib/session';
import type { QuizMarked, QuizToTake } from '../lib/types';

/**
 * Taking a quiz (October 2026, Dominguez: "i want to send all staff a 'quiz'
 * to make sure they are uptodate on these procedures"). The questions asked
 * of this person, the answers in a fresh order each go, marked at once with
 * what each right answer was and why. As many goes as it takes to pass; a
 * pass confirms what they were asked in Required reading.
 */
export function QuizPage() {
  const t = useT();
  const { id = '' } = useParams();
  const isManager = useIsManager();
  const [quiz, setQuiz] = useState<QuizToTake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<QuizMarked | null>(null);
  const [busy, setBusy] = useState(false);
  /// A new order of answers for each go.
  const [round, setRound] = useState(0);

  const load = useCallback(() => {
    api
      .quizToTake(id)
      .then((found) => {
        setQuiz(found);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('Could not load the quiz.')),
      );
  }, [id, t]);

  useEffect(load, [load]);

  const orders = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const question of quiz?.questions ?? []) {
      result[question.id] = shuffle(question.choices.map((_, index) => index));
    }
    return result;
    // A new order per go, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz?.quiz.id, round]);

  if (error && !quiz) return <Alert>{error}</Alert>;
  if (!quiz) return <Spinner label={t('Loading the quiz')} />;

  const { questions } = quiz;
  const answered = questions.filter((question) => answers[question.id] !== undefined).length;
  const resultFor = (questionId: string) =>
    marked?.results.find((result) => result.id === questionId);
  const due = quiz.asked ? dueLabel(quiz.asked.dueOn) : null;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.answerQuiz(id, answers);
      setMarked(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('Could not send your answers. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setMarked(null);
    setAnswers({});
    setRound((value) => value + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading title={quiz.quiz.title} subtitle={quiz.quiz.intro ?? undefined} />

      <Card className="space-y-2 p-4" testId="quiz-status">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">
            {t('{n} questions', { n: questions.length })} ·{' '}
            {t('pass with {needed} right ({percent}%)', {
              needed: quiz.needed,
              percent: quiz.quiz.passPercent,
            })}
          </Badge>
          {quiz.mine.passedAt ? (
            <Badge tone="success">
              {t('✓ You passed {date}', { date: formatDate(quiz.mine.passedAt) })}
            </Badge>
          ) : quiz.mine.bestPercent !== null ? (
            <Badge tone="warning">
              {t('Best so far: {percent}%', { percent: quiz.mine.bestPercent })}
            </Badge>
          ) : null}
          {due && !quiz.mine.passedAt && (
            <Badge tone={due.late ? 'danger' : 'warning'}>{due.text}</Badge>
          )}
        </div>
        {quiz.quiz.studyHref && (
          <p className="text-sm">
            {quiz.quiz.studyHref.startsWith('/') ? (
              <Link
                to={quiz.quiz.studyHref}
                className="font-medium text-brand-700 hover:text-brand-900"
              >
                {t('Read up first →')}
              </Link>
            ) : (
              <a
                href={quiz.quiz.studyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 hover:text-brand-900"
              >
                {t('Read up first ↗')}
              </a>
            )}
          </p>
        )}
        {isManager && (
          <p className="text-xs text-slate-600">
            You see the questions for your own access and job roles. A go you take is kept like
            anybody’s.{' '}
            <Link to={`/quizzes/${id}/results`} className="font-medium text-brand-700">
              Scores →
            </Link>
          </p>
        )}
      </Card>

      {marked && (
        <div
          role="status"
          data-testid="quiz-result"
          className={`rounded-xl border p-4 shadow-sm ${
            marked.passed ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${marked.passed ? 'text-emerald-900' : 'text-amber-950'}`}
          >
            {marked.passed ? t('You passed!') : t('Not yet')}
          </h2>
          <p className={`text-sm ${marked.passed ? 'text-emerald-900' : 'text-amber-950'}`}>
            {t('{correct} of {total} right ({percent}%).', {
              correct: marked.correct,
              total: marked.total,
              percent: marked.percent,
            })}{' '}
            {marked.passed
              ? marked.confirmed > 0
                ? t('It is marked done in Required reading.')
                : ''
              : t('You need {needed} right to pass. Look at the answers below, then try again.', {
                  needed: marked.needed,
                })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={again} className={buttonClass('secondary', 'sm')}>
              {t('Take it again')}
            </button>
            <Link to="/" className={buttonClass(marked.passed ? 'primary' : 'secondary', 'sm')}>
              {t('Back to Home')}
            </Link>
          </div>
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {questions.length === 0 ? (
        <Alert tone="info">{t('There are no questions for you in this quiz.')}</Alert>
      ) : (
        <ol className="space-y-4">
          {questions.map((question, index) => {
            const result = resultFor(question.id);
            return (
              <li key={question.id}>
                <Card
                  className={`p-4 ${
                    result ? (result.right ? 'border-emerald-300' : 'border-rose-300') : ''
                  }`}
                  testId={`quiz-question-${index + 1}`}
                >
                  <fieldset>
                    <legend className="font-medium text-slate-900">
                      <span className="mr-1 text-slate-500">{index + 1}.</span>
                      {question.prompt}
                    </legend>
                    <div className="mt-3 space-y-2">
                      {orders[question.id]?.map((choice) => {
                        const picked = answers[question.id] === choice;
                        const isRight = result && result.correct === choice;
                        const isWrongPick = result && picked && !result.right;
                        return (
                          <label
                            key={choice}
                            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                              isRight
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                                : isWrongPick
                                  ? 'border-rose-300 bg-rose-50 text-rose-950'
                                  : picked
                                    ? 'border-brand-400 bg-brand-50 text-slate-900'
                                    : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                            } ${result ? 'cursor-default' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`q-${question.id}`}
                              className="mt-0.5 h-4 w-4"
                              checked={picked}
                              disabled={Boolean(result)}
                              onChange={() =>
                                setAnswers((current) => ({ ...current, [question.id]: choice }))
                              }
                            />
                            <span className="flex-1">
                              {question.choices[choice]}
                              {isRight && (
                                <span className="ml-2 font-semibold">{t('✓ Right answer')}</span>
                              )}
                              {isWrongPick && (
                                <span className="ml-2 font-semibold">{t('✗ Your answer')}</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {result?.explanation && (
                    <p
                      className={`mt-3 text-sm ${result.right ? 'text-emerald-900' : 'text-rose-900'}`}
                    >
                      {result.explanation}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {!marked && questions.length > 0 && (
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-md sm:bottom-4">
          <p className="text-sm text-slate-700" data-testid="quiz-answered">
            {t('{answered} of {total} answered', { answered, total: questions.length })}
          </p>
          <button
            type="button"
            disabled={busy || answered < questions.length}
            onClick={() => void send()}
            className={buttonClass('primary')}
          >
            {busy ? t('Marking…') : t('Send my answers')}
          </button>
        </div>
      )}
    </div>
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
