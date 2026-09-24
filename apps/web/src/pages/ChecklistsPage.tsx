import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChecklistTaskRow } from '../components/ChecklistTaskRow';
import { ChecklistTemplateEditor } from '../components/ChecklistTemplateEditor';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useIsAdmin, useIsManager, useSession } from '../lib/session';
import type {
  Checklist,
  ChecklistKind,
  ChecklistTemplate,
  Employee,
} from '../lib/types';

type StateFilter = 'open' | 'completed' | 'all';

export function ChecklistsPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [state, setState] = useState<StateFilter>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [newTemplateKind, setNewTemplateKind] = useState<ChecklistKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [lists, tpls, people] = await Promise.all([
        api.listChecklists({ state }),
        isManager ? api.checklistTemplates() : Promise.resolve([]),
        isManager ? api.listEmployees() : Promise.resolve([]),
      ]);
      setChecklists(lists);
      setTemplates(tpls);
      setStaff(people);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load checklists.');
    } finally {
      setLoading(false);
    }
  }, [isManager, state]);

  useEffect(() => {
    void load();
  }, [load]);

  // Replaces one checklist in place, so ticking a task off does not collapse
  // the card you are working in.
  const replace = useCallback((updated: Checklist) => {
    setChecklists((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }, []);

  const mine = useMemo(
    () => checklists.filter((item) => item.employee.id === employee?.id),
    [checklists, employee?.id],
  );
  const others = useMemo(
    () => checklists.filter((item) => item.employee.id !== employee?.id),
    [checklists, employee?.id],
  );

  if (loading) {
    return <Spinner label="Loading checklists" />;
  }

  return (
    <div>
      <PageHeading
        title={isManager ? 'Onboarding & Offboarding' : 'Your checklist'}
        subtitle={
          isManager
            ? 'Every step of bringing someone on and seeing them off, with the paperwork attached to it.'
            : 'What is left to do, and what you need to hand in.'
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {isManager && (
        <div className="mb-6">
          <StartChecklistForm
            staff={staff}
            templates={templates}
            onStarted={(checklist) => {
              setChecklists((current) => [checklist, ...current]);
              setOpenId(checklist.id);
            }}
          />
        </div>
      )}

      {isManager && (
        <div className="mb-4 flex items-center gap-2">
          {(['open', 'completed', 'all'] as StateFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setState(option)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                state === option
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option === 'open' ? 'In progress' : option === 'completed' ? 'Finished' : 'Everything'}
            </button>
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div className="mb-8">
          {isManager && (
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Yours
            </h2>
          )}
          <div className="space-y-3">
            {mine.map((checklist) => (
              <ChecklistCard
                key={checklist.id}
                checklist={checklist}
                expanded={openId === checklist.id}
                onToggle={() => setOpenId(openId === checklist.id ? null : checklist.id)}
                onChanged={replace}
                onDeleted={() => void load()}
                canDelete={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {isManager && (
        <>
          {mine.length > 0 && others.length > 0 && (
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Everyone else
            </h2>
          )}
          {others.length === 0 && mine.length === 0 ? (
            <EmptyState>
              Nothing on the go.{' '}
              {state === 'open'
                ? 'Start one above when somebody joins or leaves.'
                : 'Try a different filter.'}
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {others.map((checklist) => (
                <ChecklistCard
                  key={checklist.id}
                  checklist={checklist}
                  expanded={openId === checklist.id}
                  onToggle={() => setOpenId(openId === checklist.id ? null : checklist.id)}
                  onChanged={replace}
                  onDeleted={() => void load()}
                  canDelete={isAdmin}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!isManager && mine.length === 0 && (
        <EmptyState>
          You have no checklist at the moment. Nothing to do here.
        </EmptyState>
      )}

      {isManager && templates.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Templates
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Starting points, not gospel — edit them to match how the practice actually
            works. Changing a template never alters a checklist already under way, so
            what somebody signed stays what they signed.
          </p>

          {isAdmin && !newTemplateKind && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setNewTemplateKind('ONBOARDING')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                + New onboarding template
              </button>
              <button
                type="button"
                onClick={() => setNewTemplateKind('OFFBOARDING')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                + New offboarding template
              </button>
            </div>
          )}

          {newTemplateKind && (
            <div className="mb-3">
              <Card>
                <ChecklistTemplateEditor
                  kind={newTemplateKind}
                  onSaved={(created) => {
                    setTemplates((current) => [...current, created]);
                    setNewTemplateKind(null);
                  }}
                  onCancel={() => setNewTemplateKind(null)}
                />
              </Card>
            </div>
          )}

          <div className="space-y-3">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                canEdit={isAdmin}
                onChanged={(updated) =>
                  setTemplates((current) =>
                    current.map((item) => (item.id === updated.id ? updated : item)),
                  )
                }
                onArchived={(id) =>
                  setTemplates((current) => current.filter((item) => item.id !== id))
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistCard({
  checklist,
  expanded,
  onToggle,
  onChanged,
  onDeleted,
  canDelete,
}: {
  checklist: Checklist;
  expanded: boolean;
  onToggle: () => void;
  onChanged: (checklist: Checklist) => void;
  onDeleted: () => void;
  canDelete: boolean;
}) {
  const { employee } = useSession();
  const isManager = useIsManager();
  const confirm = useConfirm();

  const name =
    checklist.employee.preferredName ??
    `${checklist.employee.firstName} ${checklist.employee.lastName}`;
  const isMine = checklist.employee.id === employee?.id;

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{name}</span>
            <Badge tone={checklist.kind === 'ONBOARDING' ? 'info' : 'neutral'}>
              {checklist.kind === 'ONBOARDING' ? 'onboarding' : 'offboarding'}
            </Badge>
            {checklist.completedAt ? (
              <Badge tone="success">finished</Badge>
            ) : (
              checklist.overdueCount > 0 && (
                <Badge tone="danger">
                  {checklist.overdueCount} overdue
                </Badge>
              )
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {checklist.name} · {checklist.kind === 'ONBOARDING' ? 'from' : 'last day'}{' '}
            {formatCalendarDate(checklist.anchorDate)}
            {checklist.nextTask && ` · next: ${checklist.nextTask}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-slate-600">
            {checklist.progress.settled} of {checklist.progress.total}
          </span>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${
                checklist.completedAt ? 'bg-emerald-500' : 'bg-brand-600'
              }`}
              style={{ width: `${checklist.progress.percent}%` }}
            />
          </div>
          <span aria-hidden className="text-slate-400">
            {expanded ? '▾' : '▸'}
          </span>
        </div>
      </button>

      {expanded && (
        <>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {checklist.tasks.map((task) => (
              <ChecklistTaskRow
                key={task.id}
                task={task}
                canComplete={isManager || (isMine && task.owner === 'EMPLOYEE')}
                onChanged={onChanged}
              />
            ))}
          </ul>

          {canDelete && (
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={async () => {
                  const sure = await confirm({
                    title: 'Delete this checklist?',
                    body: `${name}’s ${checklist.name}, and the record of what was done.`,
                    confirmLabel: 'Yes, delete it',
                    cancelLabel: 'Keep it',
                  });
                  if (!sure) return;
                  await api.deleteChecklist(checklist.id);
                  onDeleted();
                }}
                className="text-xs font-medium text-slate-500 hover:text-rose-700"
              >
                Delete this checklist
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function StartChecklistForm({
  staff,
  templates,
  onStarted,
}: {
  staff: Employee[];
  templates: ChecklistTemplate[];
  onStarted: (checklist: Checklist) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChecklistKind>('ONBOARDING');
  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [anchorDate, setAnchorDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forKind = templates.filter((template) => template.kind === kind);
  const chosen = staff.find((person) => person.id === employeeId);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      onStarted(
        await api.startChecklist({
          employeeId,
          kind,
          templateId: templateId || undefined,
          anchorDate: anchorDate || undefined,
        }),
      );
      setOpen(false);
      setEmployeeId('');
      setAnchorDate('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not start.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Start a checklist
      </button>
    );
  }

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Kind</span>
          <select
            aria-label="Kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as ChecklistKind);
              setTemplateId('');
            }}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="ONBOARDING">Onboarding</option>
            <option value="OFFBOARDING">Offboarding</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Who</span>
          <select
            aria-label="Who"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">Choose someone…</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Template</span>
          <select
            aria-label="Template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">
              {forKind.find((template) => template.isDefault)?.name ?? 'The default one'}
            </option>
            {forKind.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {kind === 'ONBOARDING' ? 'Start date' : 'Last day'}
          </span>
          <input
            aria-label={kind === 'ONBOARDING' ? 'Start date' : 'Last day'}
            type="date"
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Due dates are worked out from that date. Leave it empty to use{' '}
        {kind === 'ONBOARDING'
          ? `${chosen ? `${chosen.firstName}'s` : 'the'} hire date`
          : 'the last day already on their record'}
        .
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={saving || employeeId === ''}
          onClick={() => void submit()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Starting…' : 'Start it'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}

/// "1 day before", not "1 days before".
function describeDue(offsetDays: number | null): string {
  if (offsetDays === null) return 'no due date';
  if (offsetDays === 0) return 'on the day';

  const days = Math.abs(offsetDays);
  return `${days} ${days === 1 ? 'day' : 'days'} ${offsetDays > 0 ? 'after' : 'before'}`;
}

function TemplateCard({
  template,
  canEdit,
  onChanged,
  onArchived,
}: {
  template: ChecklistTemplate;
  canEdit: boolean;
  onChanged: (template: ChecklistTemplate) => void;
  onArchived: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{template.name}</span>
            <Badge tone={template.kind === 'ONBOARDING' ? 'info' : 'neutral'}>
              {template.kind === 'ONBOARDING' ? 'onboarding' : 'offboarding'}
            </Badge>
            {template.isDefault && <Badge tone="success">default</Badge>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {template.tasks.length} {template.tasks.length === 1 ? 'task' : 'tasks'}
          </p>
        </div>
        <span aria-hidden className="text-slate-400">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && !editing && (
        <ol className="divide-y divide-slate-100 border-t border-slate-100">
          {template.tasks.map((task) => (
            <li key={task.id} className="px-4 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-900">{task.title}</span>
                <span className="text-xs text-slate-500">{describeDue(task.dueOffsetDays)}</span>
              </div>
              {task.description && (
                <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {expanded && canEdit && !editing && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit this template
          </button>

          <button
            type="button"
            onClick={async () => {
              const sure = await confirm({
                title: `Retire “${template.name}”?`,
                body: 'It can no longer be started. Checklists already started keep working.',
                confirmLabel: 'Retire it',
                cancelLabel: 'Keep it',
              });
              if (!sure) return;
              await api.archiveChecklistTemplate(template.id);
              onArchived(template.id);
            }}
            className="text-sm font-medium text-slate-500 hover:text-rose-700"
          >
            Retire this template
          </button>
        </div>
      )}

      {expanded && editing && (
        <ChecklistTemplateEditor
          template={template}
          onSaved={(updated) => {
            onChanged(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </Card>
  );
}
