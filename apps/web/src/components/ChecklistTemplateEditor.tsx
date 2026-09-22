import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import type {
  ChecklistKind,
  ChecklistTemplate,
  TaskOwner,
  TemplateTaskInput,
} from '../lib/types';
import { Alert } from './ui';

/// A task while it is being edited. `dueOffsetDays` is split into a direction
/// and a number of days, because "7 days before the start date" is how a person
/// thinks about it and `-7` is not.
interface DraftTask {
  /// Stable only for React's benefit. Templates replace their task list
  /// wholesale on save, so these never reach the server.
  key: string;
  title: string;
  description: string;
  owner: TaskOwner;
  requiresDocument: boolean;
  due: 'none' | 'on-the-day' | 'before' | 'after';
  dueDays: number;
}

const OWNERS: { value: TaskOwner; label: string }[] = [
  { value: 'ADMIN', label: 'The practice' },
  { value: 'MANAGER', label: 'A manager' },
  { value: 'EMPLOYEE', label: 'The employee' },
];

let nextKey = 0;
const newKey = () => `draft-${(nextKey += 1)}`;

function toDraft(task: ChecklistTemplate['tasks'][number]): DraftTask {
  return {
    key: newKey(),
    title: task.title,
    description: task.description ?? '',
    owner: task.owner,
    requiresDocument: task.requiresDocument,
    due:
      task.dueOffsetDays === null
        ? 'none'
        : task.dueOffsetDays === 0
          ? 'on-the-day'
          : task.dueOffsetDays > 0
            ? 'after'
            : 'before',
    dueDays: Math.abs(task.dueOffsetDays ?? 0),
  };
}

function toInput(task: DraftTask): TemplateTaskInput {
  const offset =
    task.due === 'none'
      ? undefined
      : task.due === 'on-the-day'
        ? 0
        : task.due === 'before'
          ? -Math.abs(task.dueDays)
          : Math.abs(task.dueDays);

  return {
    title: task.title.trim(),
    description: task.description.trim() || undefined,
    owner: task.owner,
    requiresDocument: task.requiresDocument,
    dueOffsetDays: offset,
  };
}

const blankTask = (): DraftTask => ({
  key: newKey(),
  title: '',
  description: '',
  owner: 'ADMIN',
  requiresDocument: false,
  due: 'none',
  dueDays: 0,
});

/**
 * Editing a template, or making a new one.
 *
 * The task list is sent whole rather than patched task by task: a checklist is
 * read as a list, so it is edited as a list, and reordering is then just moving
 * an item rather than renumbering everything around it.
 *
 * Nothing here can disturb a checklist already under way — those are snapshots
 * taken when they were started. That is what makes a template safe to edit.
 */
export function ChecklistTemplateEditor({
  template,
  kind,
  onSaved,
  onCancel,
}: {
  /// Absent when making a new one.
  template?: ChecklistTemplate;
  /// Only needed for a new template; an existing one knows its own kind.
  kind?: ChecklistKind;
  onSaved: (template: ChecklistTemplate) => void;
  onCancel: () => void;
}) {
  const editingKind = template?.kind ?? kind ?? 'ONBOARDING';
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [tasks, setTasks] = useState<DraftTask[]>(
    template ? template.tasks.map(toDraft) : [blankTask()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anchorWord = editingKind === 'ONBOARDING' ? 'start date' : 'last day';

  function update(key: string, change: Partial<DraftTask>) {
    setTasks((current) =>
      current.map((task) => (task.key === key ? { ...task, ...change } : task)),
    );
  }

  function move(index: number, by: -1 | 1) {
    setTasks((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    const named = tasks.filter((task) => task.title.trim() !== '');
    if (name.trim() === '') {
      setError('Give the template a name.');
      return;
    }
    if (named.length === 0) {
      setError('A template needs at least one task in it.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        isDefault,
        tasks: named.map(toInput),
      };
      onSaved(
        template
          ? await api.updateChecklistTemplate(template.id, body)
          : await api.createChecklistTemplate({ ...body, kind: editingKind }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-slate-100 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Name</span>
          <input
            aria-label="Template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              editingKind === 'ONBOARDING' ? 'New hire — Domi Healthcare' : 'Departure — Domi Healthcare'
            }
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            aria-label="Template description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
        Use this one by default for {editingKind === 'ONBOARDING' ? 'onboarding' : 'offboarding'}
      </label>

      <ol className="mt-4 space-y-3">
        {tasks.map((task, index) => (
          <li key={task.key} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-xs text-slate-400">{index + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  aria-label={`Task ${index + 1} title`}
                  value={task.title}
                  onChange={(event) => update(task.key, { title: event.target.value })}
                  placeholder="What has to happen"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
                />
                <input
                  aria-label={`Task ${index + 1} notes`}
                  value={task.description}
                  onChange={(event) => update(task.key, { description: event.target.value })}
                  placeholder="Anything the person doing it needs to know (optional)"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">For</span>
                    <select
                      aria-label={`Task ${index + 1} owner`}
                      value={task.owner}
                      onChange={(event) =>
                        update(task.key, { owner: event.target.value as TaskOwner })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      {OWNERS.map((owner) => (
                        <option key={owner.value} value={owner.value}>
                          {owner.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">Due</span>
                    <select
                      aria-label={`Task ${index + 1} due`}
                      value={task.due}
                      onChange={(event) =>
                        update(task.key, { due: event.target.value as DraftTask['due'] })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      <option value="none">whenever</option>
                      <option value="on-the-day">on the {anchorWord}</option>
                      <option value="before">before the {anchorWord}</option>
                      <option value="after">after the {anchorWord}</option>
                    </select>
                  </label>

                  {(task.due === 'before' || task.due === 'after') && (
                    <label className="flex items-center gap-1">
                      <input
                        aria-label={`Task ${index + 1} days`}
                        type="number"
                        min={1}
                        max={365}
                        value={task.dueDays}
                        onChange={(event) =>
                          update(task.key, { dueDays: Number(event.target.value) })
                        }
                        className="w-16 rounded-lg border border-slate-300 px-2 py-1"
                      />
                      <span className="text-slate-600">days</span>
                    </label>
                  )}

                  <label className="flex items-center gap-1 text-slate-600">
                    <input
                      type="checkbox"
                      checked={task.requiresDocument}
                      onChange={(event) =>
                        update(task.key, { requiresDocument: event.target.checked })
                      }
                    />
                    needs a document
                  </label>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move task ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded px-1.5 text-slate-400 hover:text-slate-900 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move task ${index + 1} down`}
                  disabled={index === tasks.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded px-1.5 text-slate-400 hover:text-slate-900 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove task ${index + 1}`}
                  onClick={() =>
                    setTasks((current) => current.filter((item) => item.key !== task.key))
                  }
                  className="rounded px-1.5 text-slate-400 hover:text-rose-700"
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setTasks((current) => [...current, blankTask()])}
        className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        + Add a task
      </button>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Editing a template never changes a checklist that is already under way — those
        keep the wording they were started with, so what somebody signed stays what they
        signed.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : template ? 'Save the template' : 'Create the template'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
