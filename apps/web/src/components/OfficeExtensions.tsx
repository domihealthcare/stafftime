import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useT } from '../lib/i18n';
import type { Employee, OfficeExtension, OfficeExtensionInput } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card, buttonClass, inputClass } from './ui';
import { useDialog } from './useDialog';

/**
 * The practice's phone extensions in the Directory (October 2026, Dominguez —
 * from its "Office Extensions" sheet), laid out like the sheet: a column per
 * section. A person's 5xx number rings their mobile on the days they work from
 * home. Managers and admins keep it with Edit.
 */
export function OfficeExtensionsCard({
  lines,
  search,
  canEdit,
  onSaved,
}: {
  lines: OfficeExtension[];
  /// The Directory's search box narrows this list too.
  search: string;
  canEdit: boolean;
  onSaved: (lines: OfficeExtension[]) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? lines.filter((line) =>
        [line.label, line.extension, line.homeExtension ?? '', line.section]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : lines;
  const sections = groupBySection(shown);

  if (lines.length === 0 && !canEdit) return null;

  return (
    <Card className="mb-6 p-4" testId="office-extensions">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          <span aria-hidden="true">☎</span> {t('Office extensions')}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit office extensions"
            className={buttonClass('secondary', 'sm')}
          >
            Edit
          </button>
        )}
      </div>
      {sections.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {lines.length === 0 ? t('No extensions yet.') : t('No extension matches that.')}
        </p>
      ) : (
        <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          {sections.map(([section, items]) => (
            <section key={section} aria-label={section}>
              <h3 className="mb-1 text-sm font-semibold text-slate-900">{section}</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {items.map((line) => (
                  <li key={line.id} className="py-1" data-testid="extension-line">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-slate-800">{line.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                        {line.extension}
                      </span>
                    </div>
                    {line.homeExtension && (
                      <p className="text-xs text-slate-500">
                        {t('From home:')} <span className="tabular-nums">{line.homeExtension}</span>
                        {line.homeDays && ` · ${line.homeDays}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {t('A “from home” number rings that person’s mobile on the days they work from home.')}
      </p>
      {editing && (
        <ExtensionsEditor
          lines={lines}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            onSaved(saved);
            setEditing(false);
          }}
        />
      )}
    </Card>
  );
}

/// The line matched to somebody, for their Directory and Staff cards.
export function extensionOf(lines: OfficeExtension[], employeeId: string) {
  return lines.find((line) => line.employeeId === employeeId) ?? null;
}

function groupBySection(lines: OfficeExtension[]): [string, OfficeExtension[]][] {
  const sections = new Map<string, OfficeExtension[]>();
  for (const line of lines)
    sections.set(line.section, [...(sections.get(line.section) ?? []), line]);
  return [...sections.entries()];
}

type Draft = OfficeExtensionInput & { key: string };

/// Just what is saved, in a fixed order, to send and to tell whether anything changed.
const saved = (line: OfficeExtensionInput): OfficeExtensionInput => ({
  section: line.section,
  label: line.label,
  extension: line.extension,
  homeExtension: line.homeExtension,
  homeDays: line.homeDays,
  employeeId: line.employeeId,
});

let nextKey = 0;
const blank = (section: string): Draft => ({
  key: `new-${(nextKey += 1)}`,
  section,
  label: '',
  extension: '',
  homeExtension: null,
  homeDays: null,
  employeeId: null,
});

function ExtensionsEditor({
  lines,
  onClose,
  onSaved,
}: {
  lines: OfficeExtension[];
  onClose: () => void;
  onSaved: (lines: OfficeExtension[]) => void;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft[]>(() =>
    lines.map((line) => ({ ...saved(line), key: line.id })),
  );
  const [staff, setStaff] = useState<Employee[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(draft.map(saved)) !== JSON.stringify(lines.map(saved));

  useEffect(() => {
    api
      .listEmployees()
      .then((people) =>
        setStaff(people.filter((person) => person.employmentStatus !== 'TERMINATED')),
      )
      .catch(() => setStaff([]));
  }, []);

  const sections = useMemo(
    () => [...new Set(draft.map((line) => line.section).filter(Boolean))],
    [draft],
  );

  async function close() {
    if (
      changed &&
      !(await confirm({
        title: 'Leave without saving?',
        body: 'Your changes to the extensions list will be lost.',
        confirmLabel: 'Leave without saving',
        cancelLabel: 'Keep editing',
      }))
    )
      return;
    onClose();
  }
  const dialog = useDialog(() => void close());

  function update(index: number, patch: Partial<Draft>) {
    setDraft((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  }
  function move(index: number, by: -1 | 1) {
    setDraft((current) => {
      const next = [...current];
      const [line] = next.splice(index, 1);
      next.splice(index + by, 0, line);
      return next;
    });
  }
  async function remove(index: number) {
    const line = draft[index];
    const sure = await confirm({
      title: `Remove ${line.label || 'this line'}?`,
      body: 'It goes from the list when you save.',
      confirmLabel: 'Remove it',
    });
    if (sure) setDraft((current) => current.filter((_, at) => at !== index));
  }

  const problem = draft.findIndex(
    (line) =>
      !line.section.trim() ||
      !line.label.trim() ||
      !/^\d{1,6}$/.test(line.extension.trim()) ||
      (line.homeExtension && !/^\d{1,6}$/.test(line.homeExtension.trim())),
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.saveExtensions(draft.map(saved)));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the extensions.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extensions-editor-title"
        {...dialog}
        className="mx-auto w-full max-w-6xl rounded-xl bg-white p-5 shadow-xl outline-none"
        data-testid="extensions-editor"
      >
        <h2 id="extensions-editor-title" className="text-lg font-semibold text-slate-900">
          Office extensions
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Each line is a person or a phone. Match a person to their account and their extension
          shows on their Directory card too. “From home” is the number that rings their mobile, and
          the days they work from home.
        </p>

        <datalist id="extension-sections">
          {sections.map((section) => (
            <option key={section} value={section} />
          ))}
        </datalist>

        <ol className="mt-4 space-y-2">
          {draft.map((line, index) => (
            <li
              key={line.key}
              className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-12 sm:items-end"
              data-testid="extension-row"
            >
              <label className="col-span-2 text-xs text-slate-600 sm:col-span-2">
                Section
                <input
                  list="extension-sections"
                  value={line.section}
                  maxLength={40}
                  onChange={(event) => update(index, { section: event.target.value })}
                  className={`mt-0.5 ${inputClass}`}
                />
              </label>
              <label className="col-span-2 text-xs text-slate-600 sm:col-span-3">
                Name or phone
                <input
                  value={line.label}
                  maxLength={80}
                  onChange={(event) => update(index, { label: event.target.value })}
                  className={`mt-0.5 ${inputClass}`}
                />
              </label>
              <label className="col-span-2 text-xs text-slate-600 sm:col-span-2">
                Person
                <select
                  value={line.employeeId ?? ''}
                  onChange={(event) => {
                    const id = event.target.value || null;
                    const person = staff.find((candidate) => candidate.id === id);
                    update(index, {
                      employeeId: id,
                      ...(person && !line.label.trim()
                        ? { label: `${person.firstName} ${person.lastName}` }
                        : {}),
                    });
                  }}
                  className={`mt-0.5 ${inputClass}`}
                >
                  <option value="">Not a person</option>
                  {line.employeeId && !staff.some((person) => person.id === line.employeeId) && (
                    <option value={line.employeeId}>(somebody who has left)</option>
                  )}
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600 sm:col-span-1">
                Ext.
                <input
                  value={line.extension}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    update(index, { extension: event.target.value.replace(/\D/g, '') })
                  }
                  className={`mt-0.5 ${inputClass}`}
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-1">
                From home
                <input
                  value={line.homeExtension ?? ''}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    update(index, { homeExtension: event.target.value.replace(/\D/g, '') || null })
                  }
                  className={`mt-0.5 ${inputClass}`}
                />
              </label>
              <label className="col-span-2 text-xs text-slate-600 sm:col-span-1">
                Home days
                <input
                  value={line.homeDays ?? ''}
                  maxLength={40}
                  placeholder="Thursday"
                  onChange={(event) => update(index, { homeDays: event.target.value || null })}
                  className={`mt-0.5 ${inputClass}`}
                />
              </label>
              <div className="col-span-2 flex justify-end gap-1 sm:col-span-2">
                <button
                  type="button"
                  aria-label={`Move ${line.label || 'this line'} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded px-2 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${line.label || 'this line'} down`}
                  disabled={index === draft.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded px-2 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${line.label || 'this line'}`}
                  onClick={() => void remove(index)}
                  className="rounded px-2 py-1.5 text-rose-700 hover:bg-rose-50"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() =>
            setDraft((current) => [...current, blank(current[current.length - 1]?.section ?? '')])
          }
          className={`mt-3 ${buttonClass('secondary', 'sm')}`}
        >
          + Add a line
        </button>

        {problem >= 0 && (
          <p className="mt-3 text-sm text-amber-800">
            Line {problem + 1} needs a section, a name and an extension of up to six digits.
          </p>
        )}
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void close()}
            className={buttonClass('secondary', 'md')}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !changed || problem >= 0}
            onClick={() => void save()}
            className={buttonClass('primary', 'md')}
          >
            {busy ? 'Saving…' : 'Save extensions'}
          </button>
        </div>
      </div>
    </div>
  );
}
