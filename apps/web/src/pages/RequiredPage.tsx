import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useConfirm } from '../components/ConfirmDialog';
import { InviteePicker, NOBODY, type InviteeSelection } from '../components/InviteePicker';
import { MyRequirementItem, RequirementLinks, dueLabel } from '../components/RequiredItems';
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
import { t as translate, useT } from '../lib/i18n';
import { useIsManager } from '../lib/session';
import type {
  Announcement,
  Employee,
  JobRole,
  Location,
  MyRequirement,
  QuizSummary,
  RequirementInput,
  RequirementKind,
  RequirementProgress,
  RequirementSummary,
  Resource,
} from '../lib/types';

/**
 * Required reading and tasks (October 2026, Dominguez: "something the
 * admin/managers can require for need to know information or required
 * tasks"). Everybody sees what is asked of them; managers and admins also
 * set them and see who has confirmed. A nag, never a gate.
 */
export function RequiredPage() {
  const t = useT();
  const isManager = useIsManager();
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeading
        title={t('Required reading and tasks')}
        subtitle={
          isManager
            ? t('What staff have been asked to read or do, and who has confirmed. Yours are first.')
            : t('What a manager has asked you to read or do. Confirm each once you have.')
        }
      />
      <Mine />
      {isManager && <Managing />}
    </div>
  );
}

// ------------------------------------------------------------------ yours

function Mine() {
  const t = useT();
  const [items, setItems] = useState<MyRequirement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myRequirements()
      .then(setItems)
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : translate('Could not load what is asked of you.'),
        );
        setItems([]);
      });
  }, []);

  if (items === null) return <Spinner />;
  const waiting = items.filter((item) => !item.doneAt);
  const done = items.filter((item) => item.doneAt);
  const markDone = (id: string) =>
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, doneAt: new Date().toISOString() } : item,
        ) ?? null,
    );

  return (
    <section aria-labelledby="required-mine" className="space-y-3">
      <h2 id="required-mine" className="text-lg font-semibold text-slate-900">
        {t('Waiting for you')}
      </h2>
      {error && <Alert>{error}</Alert>}
      {waiting.length === 0 ? (
        <EmptyState>{t('Nothing is waiting for you. ✓')}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {waiting.map((item) => (
            <li key={item.id}>
              <Card className="p-4">
                <MyRequirementItem item={item} onDone={markDone} />
              </Card>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {t('Done ({n})', { n: done.length })}
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {done.map((item) => (
              <li key={item.id} className="py-3">
                <MyRequirementItem item={item} onDone={markDone} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// --------------------------------------------------------------- managers

interface Lists {
  employees: Employee[];
  jobRoles: JobRole[];
  locations: Location[];
  posts: Announcement[];
  resources: Resource[];
  quizzes: QuizSummary[];
}

function Managing() {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<RequirementSummary[] | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /// The one being changed, `'new'` for one being set, or nothing.
  const [editing, setEditing] = useState<RequirementSummary | 'new' | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const fromPost = params.get('post');
  /// "Send it" on a quiz opens the form with that quiz.
  const fromQuiz = params.get('quiz');

  const load = useCallback(() => {
    api
      .requirements()
      .then((found) => {
        setItems(found);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the list.'));
  }, []);

  useEffect(() => {
    load();
    Promise.all([
      api.listEmployees().then((people) => people.filter((person) => !person.isSharedAccount)),
      api.jobRoles(),
      api.listLocations(),
      api.announcements(),
      api.resources(),
      api.quizzes(),
    ])
      .then(([employees, jobRoles, locations, posts, resources, quizzes]) =>
        setLists({
          employees: employees.filter((person) => person.employmentStatus !== 'TERMINATED'),
          jobRoles,
          locations,
          posts,
          resources: resources.sections.flatMap((section) => section.resources),
          quizzes,
        }),
      )
      .catch(() => setError('Could not load the staff, job roles and offices.'));
  }, [load]);

  // "Require reading" on a News post opens the form with that post.
  useEffect(() => {
    if (fromPost || fromQuiz) setEditing('new');
  }, [fromPost, fromQuiz]);

  async function act(action: () => Promise<unknown>, failure: string, done?: string) {
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    }
  }

  async function remove(item: RequirementSummary) {
    const sure = await confirm({
      title: `Remove “${item.title}”?`,
      body: `It goes from everybody’s list, with the record of who confirmed it (${item.done} so far). To stop asking but keep that record, use “Stop asking” instead.`,
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (sure) await act(() => api.deleteRequirement(item.id), 'Could not remove that.');
  }

  const closeForm = () => {
    setEditing(null);
    if (fromPost || fromQuiz) setParams({}, { replace: true });
  };

  return (
    <section aria-labelledby="required-set" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="required-set" className="text-lg font-semibold text-slate-900">
          Asked of staff
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={buttonClass('primary', 'sm')}
          >
            + Ask people to read or do something
          </button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {editing && lists && (
        <RequirementForm
          key={editing === 'new' ? `new-${fromPost ?? ''}-${fromQuiz ?? ''}` : editing.id}
          item={editing === 'new' ? null : editing}
          lists={lists}
          postId={editing === 'new' ? fromPost : null}
          quizId={editing === 'new' ? fromQuiz : null}
          onSaved={(message) => {
            closeForm();
            setNotice(message);
            load();
          }}
          onCancel={closeForm}
        />
      )}

      {items === null ? (
        error ? null : (
          <Spinner />
        )
      ) : items.length === 0 ? (
        <EmptyState>
          Nothing asked yet. Use “+ Ask people to read or do something” - a policy to read, a
          training to do - and the app reminds them until they confirm.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const due = dueLabel(item.dueOn);
            return (
              <li key={item.id}>
                <Card className="p-4" testId={`asked-${item.title}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.kind === 'TASK' ? 'neutral' : 'info'}>
                      {item.kind === 'QUIZ'
                        ? 'Quiz'
                        : item.kind === 'READ'
                          ? 'Read and confirm'
                          : 'To do'}
                    </Badge>
                    {item.closedAt ? (
                      <Badge>Stopped {formatDate(item.closedAt)}</Badge>
                    ) : item.overdue ? (
                      <Badge tone="danger">{due?.text}</Badge>
                    ) : (
                      due && <Badge tone="warning">{due.text}</Badge>
                    )}
                  </div>
                  <p className="mt-1 font-medium text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-600">
                    For {audienceText(item)} ·{' '}
                    <strong data-testid="asked-count">
                      {item.done} of {item.asked}
                    </strong>{' '}
                    {item.kind === 'QUIZ' ? 'passed' : 'confirmed'}
                    {item.createdBy && ` · set by ${displayName(item.createdBy)}`}
                  </p>
                  {item.quiz && (
                    <p className="mt-1 text-sm">
                      <Link
                        to={`/quizzes/${item.quiz.id}/results`}
                        className="font-medium text-brand-700 hover:text-brand-900"
                      >
                        Scores for “{item.quiz.title}” →
                      </Link>
                    </p>
                  )}
                  {item.body && (
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{item.body}</p>
                  )}
                  <RequirementLinks item={item} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setOpened(opened === item.id ? null : item.id)}
                      aria-expanded={opened === item.id}
                      className={buttonClass('secondary', 'sm')}
                    >
                      {opened === item.id ? 'Hide who' : 'Who has confirmed'}
                    </button>
                    {!item.closedAt && item.done < item.asked && (
                      <button
                        type="button"
                        onClick={() =>
                          void act(async () => {
                            const { reminded } = await api.remindRequirement(item.id);
                            setNotice(
                              `Reminded ${reminded} ${reminded === 1 ? 'person' : 'people'}, on the bell and by email.`,
                            );
                          }, 'Could not send the reminders.')
                        }
                        className={buttonClass('secondary', 'sm')}
                      >
                        Remind them now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className={buttonClass('secondary', 'sm')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void act(
                          () => api.closeRequirement(item.id, !item.closedAt),
                          'Could not change that.',
                        )
                      }
                      className={buttonClass('secondary', 'sm')}
                    >
                      {item.closedAt ? 'Ask again' : 'Stop asking'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                  {opened === item.id && <WhoConfirmed id={item.id} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function audienceText(item: RequirementSummary): string {
  if (item.everyone) return 'everyone';
  const names = [
    ...(item.targets?.jobRoles.map((role) => role.name) ?? []),
    ...(item.targets?.locations.map((office) => office.name) ?? []),
    ...(item.targets?.employees.map(displayName) ?? []),
  ];
  return names.length > 0 ? names.join(', ') : 'nobody - everyone chosen has since gone';
}

function WhoConfirmed({ id }: { id: string }) {
  const [progress, setProgress] = useState<RequirementProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .requirementProgress(id)
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load that.'));
  }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!progress) return <Spinner />;
  return (
    <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Still to confirm ({progress.waiting.length})
        </h3>
        {progress.waiting.length === 0 ? (
          <p className="text-sm text-emerald-700">Everybody has. ✓</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700" data-testid="still-waiting">
            {progress.waiting.map((person) => (
              <li key={person.id}>{displayName(person)}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Confirmed ({progress.done.length})</h3>
        <ul className="mt-1 space-y-0.5 text-sm text-slate-700" data-testid="confirmed">
          {progress.done.map((person) => (
            <li key={person.id}>
              {displayName(person)}{' '}
              <span className="text-slate-500">· {formatDate(person.doneAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/// Setting one, or changing it.
function RequirementForm({
  item,
  lists,
  postId,
  quizId: quizFrom,
  onSaved,
  onCancel,
}: {
  item: RequirementSummary | null;
  lists: Lists;
  /// From "Require reading" on a News post.
  postId: string | null;
  /// From "Send it" on a quiz.
  quizId: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const post = postId ? lists.posts.find((p) => p.id === postId) : undefined;
  const fromQuiz = quizFrom ? lists.quizzes.find((q) => q.id === quizFrom) : undefined;
  const [kind, setKind] = useState<RequirementKind>(item?.kind ?? (fromQuiz ? 'QUIZ' : 'READ'));
  const [title, setTitle] = useState(item?.title ?? post?.title ?? fromQuiz?.title ?? '');
  const [quizId, setQuizId] = useState(item?.quiz?.id ?? fromQuiz?.id ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [announcementId, setAnnouncementId] = useState(item?.announcement?.id ?? post?.id ?? '');
  const [resourceId, setResourceId] = useState(item?.resource?.id ?? '');
  const [dueOn, setDueOn] = useState(item?.dueOn ?? '');
  const [who, setWho] = useState<InviteeSelection>(() =>
    !item || item.everyone
      ? { ...NOBODY, everyone: true }
      : {
          everyone: false,
          employeeIds: item.targets?.employees.map((p) => p.id) ?? [],
          jobRoleIds: item.targets?.jobRoles.map((r) => r.id) ?? [],
          locationIds: item.targets?.locations.map((l) => l.id) ?? [],
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: React.FormEvent) {
    form.preventDefault();
    setError(null);
    const chosen = who.employeeIds.length + who.jobRoleIds.length + who.locationIds.length;
    if (!who.everyone && chosen === 0) {
      setError('Choose who it is for: Everyone, or some job roles, offices or people.');
      return;
    }
    if (kind === 'QUIZ' && !quizId) {
      setError('Choose the quiz to take.');
      return;
    }
    const input: RequirementInput = {
      kind,
      title: title.trim(),
      body: body.trim() || undefined,
      url: url.trim() || undefined,
      announcementId: announcementId || null,
      resourceId: resourceId || null,
      quizId: kind === 'QUIZ' ? quizId : null,
      dueOn: dueOn || null,
      everyone: who.everyone,
      targets: who.everyone
        ? undefined
        : {
            employeeIds: who.employeeIds,
            jobRoleIds: who.jobRoleIds,
            locationIds: who.locationIds,
          },
    };
    setBusy(true);
    try {
      const saved = item
        ? await api.updateRequirement(item.id, input)
        : await api.createRequirement(input);
      onSaved(
        item
          ? 'Saved. Anybody it now reaches who it did not before has been told.'
          : `Asked. ${saved.asked ?? 'Everybody it is for'} ${
              saved.asked === 1 ? 'person has' : 'people have'
            } been told on the bell and by email.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
      setBusy(false);
    }
  }

  const heading = item ? `Change “${item.title}”` : 'Ask people to read or do something';
  return (
    <Card className="p-4">
      <form aria-label={heading} onSubmit={(form) => void submit(form)} className="space-y-4">
        <h3 className="text-base font-semibold text-slate-900">{heading}</h3>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">What is it?</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === 'READ'}
                onChange={() => setKind('READ')}
              />
              Something to read - they press “I’ve read it”
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === 'TASK'}
                onChange={() => setKind('TASK')}
              />
              Something to do - they press “Done”
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === 'QUIZ'}
                onChange={() => setKind('QUIZ')}
              />
              A quiz - passing it confirms it
            </label>
          </div>
        </fieldset>

        {kind === 'QUIZ' && (
          <Field
            label="Which quiz?"
            hint="Each person answers the questions for their job, and is reminded until they pass."
          >
            {(props) => (
              <select
                {...props}
                required
                value={quizId}
                onChange={(change) => {
                  const picked = lists.quizzes.find((q) => q.id === change.target.value);
                  setQuizId(change.target.value);
                  if (picked && !title.trim()) setTitle(picked.title);
                }}
                className={inputClass}
              >
                <option value="">Choose a quiz</option>
                {lists.quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} ({q.questionCount} questions, {q.passPercent}% to pass)
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field label="Title">
          {(props) => (
            <input
              {...props}
              required
              minLength={2}
              maxLength={160}
              placeholder={kind === 'READ' ? 'Updated fire safety plan' : 'Watch the HIPAA video'}
              value={title}
              onChange={(change) => setTitle(change.target.value)}
              className={inputClass}
            />
          )}
        </Field>

        <Field label="Details" hint="Optional. What to read or do, and anything they need to know.">
          {(props) => (
            <textarea
              {...props}
              rows={3}
              maxLength={4000}
              value={body}
              onChange={(change) => setBody(change.target.value)}
              className={inputClass}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="A News post" hint="Optional.">
            {(props) => (
              <select
                {...props}
                value={announcementId}
                onChange={(change) => setAnnouncementId(change.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {lists.posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="A Resources page or link"
            hint="Optional. They can open it even if it is another job role’s."
          >
            {(props) => (
              <select
                {...props}
                value={resourceId}
                onChange={(change) => setResourceId(change.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {lists.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="A web link" hint="Optional. https:// only - a training video, a document.">
            {(props) => (
              <input
                {...props}
                type="url"
                inputMode="url"
                placeholder="https://"
                maxLength={2000}
                value={url}
                onChange={(change) => setUrl(change.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="required-who" className="block text-sm font-medium text-slate-700">
              Who is it for?
            </label>
            <div className="mt-1">
              <InviteePicker
                id="required-who"
                value={who}
                onChange={setWho}
                employees={lists.employees}
                jobRoles={lists.jobRoles}
                locations={lists.locations}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Everyone, or any mix of job roles, offices and people. Somebody who joins a job role
              or office later is asked too.
            </p>
          </div>
          <Field label="Due" hint="Optional. Reminders come 2 days before and after it passes.">
            {(props) => (
              <input
                {...props}
                type="date"
                value={dueOn}
                onChange={(change) => setDueOn(change.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </div>

        <p className="text-xs text-slate-500">
          They are told on the bell and by email now, and reminded weekly until they confirm. It
          never stops anybody clocking in.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Ask them'}
          </button>
        </div>
      </form>
    </Card>
  );
}
