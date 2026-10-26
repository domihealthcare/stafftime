import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName, formatDate } from '../lib/format';
import type { QuizResults } from '../lib/types';

/**
 * A quiz's scores, by name (Dominguez chose named scores): who has passed and
 * when, who is still trying, who has not started of the people it was sent
 * to, and the questions missed most, which say what to go over again.
 */
export function QuizResultsPage() {
  const { id = '' } = useParams();
  const [results, setResults] = useState<QuizResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .quizResults(id)
      .then(setResults)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the scores.'),
      );
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!results) return <Spinner label="Loading the scores" />;

  const passed = results.people.filter((row) => row.passedAt);
  const trying = results.people.filter((row) => !row.passedAt);
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading
        title={`Scores: ${results.quiz.title}`}
        subtitle={`Pass mark ${results.quiz.passPercent}%. Each person answers the questions for their job, and can try again until they pass.`}
      />
      <p className="text-sm">
        <Link to="/quizzes" className="font-medium text-brand-700 hover:text-brand-900">
          ← All quizzes
        </Link>
      </p>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="quiz-score-counts">
        <Count label="Passed" value={passed.length} tone="text-emerald-700" />
        <Count label="Still trying" value={trying.length} tone="text-amber-700" />
        <Count label="Not started" value={results.notStarted.length} tone="text-slate-700" />
      </div>

      <Card className="overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 text-base font-semibold text-slate-900">
          Who has taken it
        </h2>
        {results.people.length === 0 ? (
          <div className="p-4">
            <EmptyState>Nobody has taken it yet.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="quiz-scores">
            {results.people.map((row) => (
              <li
                key={row.person.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {displayName(row.person)}
                  {!row.asked && (
                    <span className="ml-2 text-xs font-normal text-slate-500">(not sent to)</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-slate-700">
                  {row.passedAt ? (
                    <Badge tone="success">Passed {formatDate(row.passedAt)}</Badge>
                  ) : (
                    <Badge tone="warning">Not passed yet</Badge>
                  )}
                  <span>
                    Best {row.bestPercent}% · last {row.lastPercent}% · {row.attempts}{' '}
                    {row.attempts === 1 ? 'go' : 'goes'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-base font-semibold text-slate-900">
          Not started ({results.notStarted.length})
        </h2>
        {results.notStarted.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">
            Nobody it was sent to is still to start, or it has not been sent yet.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              From the requests in Required reading still open. “Remind them now” is there.
            </p>
            <ul
              className="mt-2 columns-2 text-sm text-slate-800 sm:columns-3"
              data-testid="quiz-not-started"
            >
              {results.notStarted.map((person) => (
                <li key={person.id}>{displayName(person)}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-base font-semibold text-slate-900">Missed most</h2>
        {results.missed.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">
            {results.attempts === 0
              ? 'Nothing yet.'
              : 'Every question has been answered right every time.'}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              Across all {results.attempts} goes. Worth going over at the next meeting.
            </p>
            <ol className="mt-2 space-y-1 text-sm text-slate-800" data-testid="quiz-missed">
              {results.missed.map((row) => (
                <li key={row.id} className="flex gap-3">
                  <span className="w-20 shrink-0 font-semibold text-rose-700">
                    {row.missed} {row.missed === 1 ? 'time' : 'times'}
                  </span>
                  <span>{row.prompt}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}
