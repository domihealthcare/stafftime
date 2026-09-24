import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useIsManager } from '../lib/session';
import type {
  FeedbackMessage,
  JobRole,
  Location,
  Survey,
  SurveyAudience,
  SurveyInputQuestion,
  SurveyQuestionKind,
  SurveyResults,
} from '../lib/types';

/// Shown wherever somebody is about to say something. It has to be true, and
/// it is: see `SurveysService` and the guard in no-sensitive-data.spec.ts.
const ANONYMOUS =
  'Anonymous — your name is never stored with what you say, and nobody, including admins, can find out.';

/**
 * Pulse surveys and the suggestion box.
 *
 * Everybody sees the surveys meant for them and the box. Managers also write
 * surveys, read the box, and see results — once a survey is closed and at
 * least three people answered, so no result can point at a person.
 */
export function SurveysPage() {
  const isManager = useIsManager();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [thanked, setThanked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSurveys(await api.surveys());
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load surveys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Loading surveys" />;

  const toAnswer = surveys.filter((survey) =>
    isManager ? survey.canAnswer : survey.status === 'OPEN' && !survey.answered,
  );
  const answered = surveys.filter((survey) => survey.status === 'OPEN' && survey.answered);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Surveys and feedback"
        subtitle="Short anonymous check-ins, and a suggestion box that is always open."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <section aria-label="For you" className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          For you
        </h2>
        {thanked && (
          <div className="mb-3">
            <Alert tone="success">Thank you — sent anonymously.</Alert>
          </div>
        )}
        {toAnswer.length === 0 ? (
          <EmptyState>
            {answered.length > 0
              ? 'You have answered everything open. Thank you.'
              : 'No surveys open right now.'}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {toAnswer.map((survey) => (
              <AnswerForm
                key={survey.id}
                surveyId={survey.id}
                onDone={() => {
                  setThanked(true);
                  void load();
                }}
              />
            ))}
          </div>
        )}
        {answered.length > 0 && toAnswer.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Already answered: {answered.map((survey) => survey.title).join(', ')}
          </p>
        )}
      </section>

      <SuggestionBox />

      {isManager && (
        <>
          <ManageSurveys surveys={surveys} onChanged={() => void load()} onError={setError} />
          <Inbox />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answering

function AnswerForm({ surveyId, onDone }: { surveyId: string; onDone: () => void }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [values, setValues] = useState<Record<string, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .survey(surveyId)
      .then(setSurvey)
      .catch(() => setError('Could not open that survey.'));
  }, [surveyId]);

  if (!survey) return error ? <Alert>{error}</Alert> : <Spinner label="Opening" />;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      type Answer = { questionId: string; rating?: number; choice?: string; text?: string };
      const answers = survey!.questions.flatMap((question): Answer[] => {
        const value = values[question.id];
        if (value === undefined || value === '') return [];
        if (question.kind === 'RATING') return [{ questionId: question.id, rating: Number(value) }];
        if (question.kind === 'CHOICE') return [{ questionId: question.id, choice: String(value) }];
        return [{ questionId: question.id, text: String(value) }];
      });
      await api.answerSurvey(survey!.id, answers);
      // The list reloads without this survey in it; the thank-you is shown
      // above the list so it outlives the form.
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4" testId={`answer-${survey.title}`}>
      <h3 className="font-semibold text-slate-900">{survey.title}</h3>
      {survey.intro && (
        <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{survey.intro}</p>
      )}
      <p className="mt-1 text-xs text-slate-500">{ANONYMOUS}</p>

      <div className="mt-3 space-y-4">
        {survey.questions.map((question, index) => (
          <fieldset key={question.id}>
            <legend className="text-sm font-medium text-slate-800">
              {index + 1}. {question.prompt}
            </legend>
            {question.kind === 'RATING' && (
              <div className="mt-1 flex gap-1" role="group" aria-label={question.prompt}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={values[question.id] === n}
                    onClick={() => setValues((v) => ({ ...v, [question.id]: n }))}
                    className={`h-10 w-10 rounded-lg text-sm font-semibold ring-1 ring-inset ${
                      values[question.id] === n
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="ml-2 self-center text-xs text-slate-500">1 poor · 5 great</span>
              </div>
            )}
            {question.kind === 'CHOICE' && (
              <div className="mt-1 space-y-1">
                {question.options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={question.id}
                      checked={values[question.id] === option}
                      onChange={() => setValues((v) => ({ ...v, [question.id]: option }))}
                      className="border-slate-300 text-brand-600 focus:ring-brand-600"
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}
            {question.kind === 'TEXT' && (
              <textarea
                aria-label={question.prompt}
                rows={3}
                maxLength={2000}
                value={String(values[question.id] ?? '')}
                onChange={(event) =>
                  setValues((v) => ({ ...v, [question.id]: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            )}
          </fieldset>
        ))}
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <button
        type="button"
        disabled={busy || Object.keys(values).length === 0}
        onClick={() => void send()}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send anonymously'}
      </button>
    </Card>
  );
}

function SuggestionBox() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-label="Suggestion box" className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        Suggestion box
      </h2>
      <Card className="p-4">
        <p className="text-sm text-slate-700">
          Anything you would like the managers to know — an idea, a problem, something that went
          well.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {ANONYMOUS} Only the day it arrived is kept. Bear in mind a very specific detail can give
          you away.
        </p>
        {sent && (
          <div className="mt-3">
            <Alert tone="success">Sent anonymously. Thank you.</Alert>
          </div>
        )}
        <textarea
          aria-label="Your suggestion"
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setSent(false);
          }}
          className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        {error && (
          <div className="mt-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <button
          type="button"
          disabled={busy || message.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.sendFeedback(message.trim());
              setMessage('');
              setSent(true);
            } catch (cause) {
              setError(cause instanceof ApiError ? cause.message : 'Could not send that.');
            } finally {
              setBusy(false);
            }
          }}
          className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Sending…' : 'Send anonymously'}
        </button>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Managing

const STATUS: Record<Survey['status'], { label: string; tone: 'neutral' | 'success' | 'info' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'info' },
};

function audienceLabel(survey: Survey): string {
  if (survey.audience === 'JOB_ROLE') return survey.jobRole?.name ?? 'a job role that was removed';
  if (survey.audience === 'LOCATION') return survey.location?.name ?? 'a location that was removed';
  return 'Everyone';
}

function ManageSurveys({
  surveys,
  onChanged,
  onError,
}: {
  surveys: Survey[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Survey | 'new' | null>(null);

  return (
    <section aria-label="Your surveys" className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Surveys you send
        </h2>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + New survey
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Results appear once a survey is closed and at least 3 people answered. Not before: a result
        that changes as each person answers can tell you what they said.
      </p>

      {editing !== null && (
        <div className="mb-3">
          <SurveyBuilder
            survey={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {surveys.length === 0 ? (
        <EmptyState>No surveys yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {surveys.map((survey) => (
            <ManagedSurvey
              key={survey.id}
              survey={survey}
              onEdit={() => setEditing(survey)}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManagedSurvey({
  survey,
  onEdit,
  onChanged,
  onError,
}: {
  survey: Survey;
  onEdit: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const confirm = useConfirm();

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  }

  const button =
    'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';

  return (
    <Card className="p-3" testId={`survey-${survey.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{survey.title}</span>
            <Badge tone={STATUS[survey.status].tone}>{STATUS[survey.status].label}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            For {audienceLabel(survey)} · {survey.questions.length} question
            {survey.questions.length === 1 ? '' : 's'}
            {survey.status !== 'DRAFT' &&
              ` · ${survey.responses} of ${survey.audienceSize} answered`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {survey.status === 'DRAFT' && (
            <>
              <button type="button" onClick={onEdit} className={button}>
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => api.openSurvey(survey.id))}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Send it
              </button>
            </>
          )}
          {survey.status === 'OPEN' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => api.closeSurvey(survey.id))}
              className={button}
            >
              Close it
            </button>
          )}
          {survey.status === 'CLOSED' && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (results) return setResults(null);
                try {
                  setResults(await api.surveyResults(survey.id));
                } catch (cause) {
                  onError(cause instanceof ApiError ? cause.message : 'Could not load results.');
                }
              }}
              className={button}
            >
              {results ? 'Hide results' : 'Results'}
            </button>
          )}
          {survey.status !== 'OPEN' && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete “${survey.title}”?`,
                  body:
                    survey.status === 'CLOSED'
                      ? 'Its answers and results go with it.'
                      : 'It has not been sent, so nobody has answered it.',
                  confirmLabel: 'Delete it',
                  cancelLabel: 'Keep it',
                });
                if (sure) await act(() => api.deleteSurvey(survey.id));
              }}
              className="text-xs font-medium text-slate-400 hover:text-rose-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {results && <ResultsView results={results} />}
    </Card>
  );
}

function ResultsView({ results }: { results: SurveyResults }) {
  if (!results.available) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <Alert tone="info">{results.reason}</Alert>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-4 border-t border-slate-100 pt-3" data-testid="survey-results">
      <p className="text-xs text-slate-500">{results.responses} people answered.</p>
      {results.questions.map((question, index) => (
        <div key={question.id}>
          <p className="text-sm font-medium text-slate-800">
            {index + 1}. {question.prompt}
          </p>
          {question.kind === 'RATING' && question.counts && (
            <div className="mt-1">
              <p className="text-sm text-slate-700">
                Average <span className="font-semibold">{question.average ?? '—'}</span> out of 5
              </p>
              <Bars labels={['1', '2', '3', '4', '5']} counts={question.counts} />
            </div>
          )}
          {question.kind === 'CHOICE' && question.counts && (
            <Bars labels={question.options} counts={question.counts} />
          )}
          {question.kind === 'TEXT' && (
            <ul className="mt-1 space-y-1">
              {(question.texts ?? []).map((text, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/// Plain horizontal bars: one per answer, labelled with the count. Enough to
/// read at a glance without a charting library.
function Bars({ labels, counts }: { labels: string[]; counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <ul className="mt-1 space-y-1">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-2 text-xs text-slate-700">
          <span className="w-24 shrink-0 truncate">{label}</span>
          <span className="h-3 flex-1 rounded bg-slate-100">
            <span
              className="block h-3 rounded bg-brand-500"
              style={{ width: `${(counts[i] / max) * 100}%` }}
            />
          </span>
          <span className="w-6 text-right tabular-nums">{counts[i]}</span>
        </li>
      ))}
    </ul>
  );
}

function SurveyBuilder({
  survey,
  onSaved,
  onCancel,
}: {
  survey: Survey | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(survey?.title ?? '');
  const [intro, setIntro] = useState(survey?.intro ?? '');
  const [audience, setAudience] = useState<SurveyAudience>(survey?.audience ?? 'EVERYONE');
  const [jobRoleId, setJobRoleId] = useState(survey?.jobRole?.id ?? '');
  const [locationId, setLocationId] = useState(survey?.location?.id ?? '');
  const [questions, setQuestions] = useState<SurveyInputQuestion[]>(
    survey?.questions.map(({ kind, prompt, options }) => ({ kind, prompt, options })) ?? [
      { kind: 'RATING', prompt: '' },
    ],
  );
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [places, setPlaces] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .jobRoles()
      .then(setRoles)
      .catch(() => undefined);
    api
      .listLocations()
      .then(setPlaces)
      .catch(() => undefined);
  }, []);

  const change = (index: number, patch: Partial<SurveyInputQuestion>) =>
    setQuestions((current) => current.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.saveSurvey(survey?.id ?? null, {
        title: title.trim(),
        intro: intro.trim() || undefined,
        audience,
        jobRoleId: audience === 'JOB_ROLE' ? jobRoleId : undefined,
        locationId: audience === 'LOCATION' ? locationId : undefined,
        questions: questions.map((q) => ({
          kind: q.kind,
          prompt: q.prompt.trim(),
          ...(q.kind === 'CHOICE' ? { options: q.options ?? [] } : {}),
        })),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Title</span>
          <input
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder="How was September?"
            className={field}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            A line of introduction <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            aria-label="Introduction"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            maxLength={1000}
            className={field}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Who it is for</span>
          <select
            aria-label="Who it is for"
            value={audience}
            onChange={(e) => setAudience(e.target.value as SurveyAudience)}
            className={field}
          >
            <option value="EVERYONE">Everyone</option>
            <option value="JOB_ROLE">One job role</option>
            <option value="LOCATION">One location</option>
          </select>
        </label>
        {audience === 'JOB_ROLE' && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Job role</span>
            <select
              aria-label="Job role"
              value={jobRoleId}
              onChange={(e) => setJobRoleId(e.target.value)}
              className={field}
            >
              <option value="">Choose…</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} ({role.members.length})
                </option>
              ))}
            </select>
          </label>
        )}
        {audience === 'LOCATION' && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Location</span>
            <select
              aria-label="Location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={field}
            >
              <option value="">Choose…</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {audience === 'JOB_ROLE' &&
        (roles.find((role) => role.id === jobRoleId)?.members.length ?? 3) < 3 && (
          <div className="mt-3">
            <Alert tone="warning">
              Fewer than 3 people are in that role, so no results would ever be shown.
            </Alert>
          </div>
        )}

      <div className="mt-4 space-y-3">
        {questions.map((question, index) => (
          <div
            key={index}
            className="rounded-lg bg-slate-50 p-3"
            data-testid={`question-${index + 1}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Question {index + 1}</span>
              <select
                aria-label={`Question ${index + 1} kind`}
                value={question.kind}
                onChange={(e) => change(index, { kind: e.target.value as SurveyQuestionKind })}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="RATING">1–5 rating</option>
                <option value="CHOICE">Pick one</option>
                <option value="TEXT">Written answer</option>
              </select>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}
                  className="ml-auto text-xs font-medium text-slate-400 hover:text-rose-700"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              aria-label={`Question ${index + 1}`}
              value={question.prompt}
              onChange={(e) => change(index, { prompt: e.target.value })}
              maxLength={300}
              placeholder="How supported did you feel this month?"
              className={`mt-2 ${field}`}
            />
            {question.kind === 'CHOICE' && (
              <textarea
                aria-label={`Question ${index + 1} choices`}
                rows={3}
                value={(question.options ?? []).join('\n')}
                onChange={(e) => change(index, { options: e.target.value.split('\n') })}
                placeholder={'One choice per line\nMornings\nAfternoons'}
                className={`mt-2 ${field}`}
              />
            )}
          </div>
        ))}
        {questions.length < 20 && (
          <button
            type="button"
            onClick={() => setQuestions((current) => [...current, { kind: 'TEXT', prompt: '' }])}
            className="text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            + Add a question
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={
            busy || title.trim().length < 2 || questions.some((q) => q.prompt.trim().length < 2)
          }
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save as draft'}
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

/// The suggestion box, from the managers' side.
function Inbox() {
  const [archived, setArchived] = useState(false);
  const [messages, setMessages] = useState<FeedbackMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await api.feedback(archived));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the suggestion box.');
    }
  }, [archived]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="What people have said" className="mb-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          In the suggestion box
        </h2>
        <button
          type="button"
          onClick={() => setArchived((shown) => !shown)}
          className="text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          {archived ? 'Show new' : 'Show dealt with'}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!messages ? (
        <Spinner label="Loading" />
      ) : messages.length === 0 ? (
        <EmptyState>{archived ? 'Nothing dealt with yet.' : 'Nothing new.'}</EmptyState>
      ) : (
        <div className="space-y-2">
          {messages.map((message) => (
            <Card key={message.id} className="p-3" testId="feedback-message">
              <p className="whitespace-pre-line text-sm text-slate-800">{message.message}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{formatCalendarDate(message.receivedOn)}</span>
                {!message.archivedAt && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.archiveFeedback(message.id).catch(() => undefined);
                      void load();
                    }}
                    className="font-medium text-slate-600 hover:text-slate-900"
                  >
                    Mark as dealt with
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
