import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName, formatDate } from '../lib/format';
import type { JobRole, Quiz, QuizInput, QuizSummary } from '../lib/types';

/**
 * Quizzes (October 2026, Dominguez: "i want to send all staff a 'quiz' to
 * make sure they are uptodate on these procedures"). Managers and admins
 * write them here and send them through Required reading; a pass is what
 * confirms it there. Scores are by name. The first one, the downtime
 * procedures, was loaded ready to send.
 */
export function QuizzesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<QuizSummary[] | null>(null);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /// The quiz being written: a saved one, a new one, or none.
  const [editing, setEditing] = useState<Quiz | 'new' | null>(null);

  const load = useCallback(() => {
    api
      .quizzes()
      .then((found) => {
        setItems(found);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the quizzes.'),
      );
  }, []);

  useEffect(() => {
    load();
    api
      .jobRoles()
      .then(setRoles)
      .catch(() => setError('Could not load the job roles.'));
  }, [load]);

  async function edit(id: string) {
    setNotice(null);
    try {
      setEditing(await api.quiz(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open that quiz.');
    }
  }

  async function remove(item: QuizSummary) {
    const sure = await confirm({
      title: `Remove “${item.title}”?`,
      body:
        item.tried > 0
          ? `Its questions go, with the scores of the ${item.tried} ${item.tried === 1 ? 'person' : 'people'} who took it.`
          : 'Its questions go. Nobody has taken it yet.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.deleteQuiz(item.id);
      setNotice(`“${item.title}” removed.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove it.');
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading
        title="Quizzes"
        subtitle="Write a quiz, then send it through Required reading. Each person answers the questions for their job, by name, and is reminded until they pass."
      />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {editing ? (
        <QuizEditor
          key={editing === 'new' ? 'new' : editing.id}
          quiz={editing === 'new' ? null : editing}
          roles={roles}
          onSaved={(saved, isNew) => {
            setEditing(null);
            setNotice(
              isNew
                ? `“${saved.title}” saved. Send it from its card when it is ready.`
                : `“${saved.title}” saved. Scores already given stay as they were.`,
            );
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setEditing('new');
            }}
            className={buttonClass('primary', 'sm')}
          >
            + New quiz
          </button>
        </div>
      )}

      {items === null ? (
        error ? null : (
          <Spinner label="Loading the quizzes" />
        )
      ) : items.length === 0 ? (
        <EmptyState>No quizzes yet. Use “+ New quiz” to write one.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="p-4" testId={`quiz-${item.title}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  {item.sent > 0 ? <Badge tone="info">Sent</Badge> : <Badge>Not sent</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {item.questionCount} {item.questionCount === 1 ? 'question' : 'questions'} · pass
                  mark {item.passPercent}% ·{' '}
                  <strong data-testid="quiz-passed">
                    {item.passed} passed of {item.tried} who took it
                  </strong>
                  {item.createdBy && ` · by ${displayName(item.createdBy)}`} · changed{' '}
                  {formatDate(item.updatedAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/required?quiz=${item.id}`}
                    className={buttonClass(item.sent > 0 ? 'secondary' : 'primary', 'sm')}
                  >
                    {item.sent > 0 ? 'Send it to more people' : 'Send it'}
                  </Link>
                  <Link
                    to={`/quizzes/${item.id}/results`}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Scores
                  </Link>
                  <Link to={`/quizzes/${item.id}`} className={buttonClass('secondary', 'sm')}>
                    Try it
                  </Link>
                  <button
                    type="button"
                    onClick={() => void edit(item.id)}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Edit
                  </button>
                  {!item.everSent && (
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ editor

interface Draft {
  key: string;
  id?: string;
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
  jobRoleIds: string[];
  forManagers: boolean;
}

let nextKey = 0;
const freshKey = () => `q${++nextKey}`;

const blankQuestion = (): Draft => ({
  key: freshKey(),
  prompt: '',
  choices: ['', '', ''],
  correct: 0,
  explanation: '',
  jobRoleIds: [],
  forManagers: false,
});

function QuizEditor({
  quiz,
  roles,
  onSaved,
  onCancel,
}: {
  quiz: Quiz | null;
  roles: JobRole[];
  onSaved: (quiz: Quiz, isNew: boolean) => void;
  onCancel: () => void;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [intro, setIntro] = useState(quiz?.intro ?? '');
  const [passPercent, setPassPercent] = useState(String(quiz?.passPercent ?? 80));
  const [studyHref, setStudyHref] = useState(quiz?.studyHref ?? '');
  const [questions, setQuestions] = useState<Draft[]>(() =>
    quiz
      ? quiz.questions.map((question) => ({
          key: freshKey(),
          id: question.id,
          prompt: question.prompt,
          choices: question.choices,
          correct: question.correct,
          explanation: question.explanation ?? '',
          jobRoleIds: question.jobRoleIds,
          forManagers: question.forManagers,
        }))
      : [blankQuestion()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (key: string, patch: Partial<Draft>) =>
    setQuestions((current) => current.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  function move(index: number, by: -1 | 1) {
    setQuestions((current) => {
      const next = [...current];
      const [taken] = next.splice(index, 1);
      next.splice(index + by, 0, taken);
      return next;
    });
  }

  async function removeQuestion(draft: Draft, place: number) {
    const sure = await confirm({
      title: `Take out question ${place}?`,
      body: draft.prompt.trim() ? `“${draft.prompt.trim()}”` : 'It has nothing written yet.',
      confirmLabel: 'Take it out',
      cancelLabel: 'Keep it',
    });
    if (sure) setQuestions((current) => current.filter((q) => q.key !== draft.key));
  }

  async function save(form: React.FormEvent) {
    form.preventDefault();
    setError(null);
    const pass = Number(passPercent);
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) {
      setError('The pass mark is a whole number from 1 to 100.');
      return;
    }
    if (questions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    const input: QuizInput = {
      title: title.trim(),
      intro: intro.trim() || undefined,
      passPercent: pass,
      studyHref: studyHref.trim() || undefined,
      questions: questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: q.choices,
        correct: q.correct,
        explanation: q.explanation.trim() || undefined,
        jobRoleIds: q.jobRoleIds,
        forManagers: q.forManagers,
      })),
    };
    setBusy(true);
    try {
      const saved = quiz ? await api.updateQuiz(quiz.id, input) : await api.createQuiz(input);
      onSaved(saved, !quiz);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the quiz.');
      setBusy(false);
    }
  }

  const heading = quiz ? `Change “${quiz.title}”` : 'New quiz';
  return (
    <Card className="p-4">
      <form aria-label={heading} onSubmit={(form) => void save(form)} className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
        <Field label="Title">
          {(props) => (
            <input
              {...props}
              required
              minLength={2}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="A line above the questions" hint="Optional.">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              maxLength={2000}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pass mark (%)" hint="The share of their questions to get right.">
            {(props) => (
              <input
                {...props}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                value={passPercent}
                onChange={(e) => setPassPercent(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Where to read up first"
              hint="Optional. A screen in Domi Staff, like /downtime?tab=procedures, or a link starting https://"
            >
              {(props) => (
                <input
                  {...props}
                  maxLength={2000}
                  value={studyHref}
                  onChange={(e) => setStudyHref(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </div>

        <ol className="space-y-4">
          {questions.map((q, index) => (
            <li key={q.key}>
              <QuestionEditor
                draft={q}
                place={index + 1}
                roles={roles}
                onChange={(patch) => change(q.key, patch)}
                onUp={index > 0 ? () => move(index, -1) : undefined}
                onDown={index < questions.length - 1 ? () => move(index, 1) : undefined}
                onRemove={() => void removeQuestion(q, index + 1)}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setQuestions((current) => [...current, blankQuestion()])}
          className={buttonClass('secondary', 'sm')}
        >
          + Add a question
        </button>

        {quiz && (
          <p className="text-xs text-slate-600">
            Scores already given stay as they were. Anybody still to pass answers the questions as
            they are now.
          </p>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : 'Save the quiz'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function QuestionEditor({
  draft,
  place,
  roles,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  draft: Draft;
  place: number;
  roles: JobRole[];
  onChange: (patch: Partial<Draft>) => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
}) {
  const forEveryone = draft.jobRoleIds.length === 0 && !draft.forManagers;
  const setChoice = (index: number, value: string) =>
    onChange({ choices: draft.choices.map((choice, i) => (i === index ? value : choice)) });
  const removeChoice = (index: number) =>
    onChange({
      choices: draft.choices.filter((_, i) => i !== index),
      correct:
        draft.correct === index ? 0 : draft.correct > index ? draft.correct - 1 : draft.correct,
    });
  const toggleRole = (id: string) =>
    onChange({
      jobRoleIds: draft.jobRoleIds.includes(id)
        ? draft.jobRoleIds.filter((roleId) => roleId !== id)
        : [...draft.jobRoleIds, id],
    });

  return (
    <div
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      data-testid={`edit-question-${place}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Question {place}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!onUp}
            onClick={onUp}
            aria-label={`Move question ${place} up`}
            className={buttonClass('secondary', 'sm')}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={!onDown}
            onClick={onDown}
            aria-label={`Move question ${place} down`}
            className={buttonClass('secondary', 'sm')}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            Take out
          </button>
        </div>
      </div>
      <Field label="Question">
        {(props) => (
          <textarea
            {...props}
            rows={2}
            required
            maxLength={500}
            value={draft.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          Answers: tick the right one. They are shown in a different order each time.
        </legend>
        <ul className="mt-1 space-y-2">
          {draft.choices.map((choice, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name={`right-${draft.key}`}
                aria-label={`Answer ${index + 1} is the right one`}
                checked={draft.correct === index}
                onChange={() => onChange({ correct: index })}
                className="h-4 w-4"
              />
              <input
                aria-label={`Answer ${index + 1}`}
                required
                maxLength={300}
                value={choice}
                onChange={(e) => setChoice(index, e.target.value)}
                className={`${inputClass} ${draft.correct === index ? 'border-emerald-400' : ''}`}
              />
              {draft.choices.length > 2 && (
                <button
                  type="button"
                  aria-label={`Take out answer ${index + 1}`}
                  onClick={() => removeChoice(index)}
                  className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {draft.choices.length < 6 && (
          <button
            type="button"
            onClick={() => onChange({ choices: [...draft.choices, ''] })}
            className="mt-2 text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            + Another answer
          </button>
        )}
      </fieldset>
      <Field
        label="Why (shown once they answer)"
        hint="Optional, but it is what teaches a wrong answer something."
      >
        {(props) => (
          <textarea
            {...props}
            rows={2}
            maxLength={1000}
            value={draft.explanation}
            onChange={(e) => onChange({ explanation: e.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Who is asked it?</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={forEveryone}
              onChange={() => onChange({ jobRoleIds: [], forManagers: false })}
            />
            Everyone
          </label>
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.jobRoleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
              />
              {role.name}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.forManagers}
              onChange={() => onChange({ forManagers: !draft.forManagers })}
            />
            Managers and admins (by access)
          </label>
        </div>
      </fieldset>
    </div>
  );
}
