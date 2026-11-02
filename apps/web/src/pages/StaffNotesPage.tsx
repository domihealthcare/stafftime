import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  Alert,
  Badge,
  Card,
  Field,
  PageHeading,
  Spinner,
  buttonClass,
  inputClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { useIsManager } from '../lib/session';
import type { StaffNote, StaffNoteKind, StaffNoteList } from '../lib/types';

const MAX_LENGTH = 2000;

export const KIND_LABELS: Record<StaffNoteKind, string> = {
  PRAISE: 'Praise',
  CONCERN: 'Concern',
  ATTENDANCE: 'Attendance',
  CONDUCT: 'Conduct',
  PERFORMANCE: 'Performance',
  MEETING: 'Meeting',
  OTHER: 'Other',
};
const KIND_TONES: Record<StaffNoteKind, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PRAISE: 'success',
  CONCERN: 'danger',
  ATTENDANCE: 'warning',
  CONDUCT: 'danger',
  PERFORMANCE: 'info',
  MEETING: 'neutral',
  OTHER: 'neutral',
};
const KINDS = Object.keys(KIND_LABELS) as StaffNoteKind[];

/**
 * Confidential notes on staff (2 November 2026, Dominguez: "somewhere for
 * managers/admin to write confidential notes on employees ... internal and
 * should not be seen by the actual employee", and "viewable as a chart as
 * well (not just in each individual staff card)"). Every note in one table,
 * narrowed by person, kind or words; a Staff card's Notes opens it on that
 * person (`?person=`). Managers and admins, behind the PIN. Nobody sees the
 * notes about themselves, so the server never sends them.
 */
export function StaffNotesPage() {
  const isManager = useIsManager();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<StaffNoteList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState<StaffNoteKind | ''>('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ note?: StaffNote } | null>(null);
  const person = params.get('person') ?? '';

  const load = useCallback(() => {
    api
      .staffNotes()
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the notes.'),
      );
  }, []);
  useEffect(() => {
    if (isManager) load();
  }, [isManager, load]);

  if (!isManager) {
    return <Alert tone="info">Staff notes are for managers and admins.</Alert>;
  }
  if (!data) return error ? <Alert>{error}</Alert> : <Spinner />;

  const choosePerson = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('person', id);
    else next.delete('person');
    setParams(next, { replace: true });
  };

  const needle = search.trim().toLowerCase();
  const shown = data.notes.filter(
    (note) =>
      (!person || note.person.id === person) &&
      (!kind || note.kind === kind) &&
      (!needle ||
        [note.body, note.person.name, note.author?.name ?? ''].some((text) =>
          text.toLowerCase().includes(needle),
        )),
  );
  const chosen = data.people.find((p) => p.id === person);

  async function remove(note: StaffNote) {
    const sure = await confirm({
      title: `Remove this note about ${note.person.name}?`,
      body: 'It is deleted for good. Nobody can read it after this.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.removeStaffNote(note.id);
      setNotice('The note was removed.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that note.');
    }
  }

  return (
    <div className="max-w-6xl">
      <PageHeading
        title="Staff notes"
        subtitle="Confidential notes on staff, for managers and admins only. The person a note is about never sees it, and you never see notes written about you."
      />
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-3">
          <Alert tone="success">
            <span role="status">{notice}</span>
          </Alert>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_1fr_auto] lg:items-end">
        <SearchableSelect
          label="Person"
          value={person}
          anyLabel="Everyone"
          options={data.people.map((p) => ({
            value: p.id,
            label: p.former ? `${p.name} (former)` : p.name,
          }))}
          onChange={choosePerson}
        />
        <div>
          <label htmlFor="note-kind-filter" className="block text-sm font-medium text-slate-700">
            Kind
          </label>
          <select
            id="note-kind-filter"
            className={`mt-1 ${inputClass}`}
            value={kind}
            onChange={(event) => setKind(event.target.value as StaffNoteKind | '')}
          >
            <option value="">Any kind</option>
            {KINDS.map((key) => (
              <option key={key} value={key}>
                {KIND_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="note-search" className="block text-sm font-medium text-slate-700">
            Search the notes
          </label>
          <input
            id="note-search"
            type="search"
            className={`mt-1 ${inputClass}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Any words"
          />
        </div>
        <button
          type="button"
          className={buttonClass('primary')}
          onClick={() => {
            setNotice(null);
            setForm({});
          }}
        >
          + Add a note
        </button>
      </div>

      <p className="mb-2 text-sm text-slate-600" data-testid="notes-count">
        {shown.length} {shown.length === 1 ? 'note' : 'notes'}
        {chosen ? ` about ${chosen.name}` : ''}
        {kind ? `, ${KIND_LABELS[kind].toLowerCase()}` : ''}
      </p>

      {shown.length === 0 ? (
        <Card className="p-4 text-sm text-slate-600">
          {data.notes.length === 0
            ? 'No notes yet. Press + Add a note to write the first one.'
            : 'No notes match.'}
        </Card>
      ) : (
        <>
          {/* A table on a laptop, cards below: it never scrolls sideways. */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full table-fixed text-left text-sm" data-testid="notes-table">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="w-32 px-3 py-2">
                    Date
                  </th>
                  <th scope="col" className="w-44 px-3 py-2">
                    About
                  </th>
                  <th scope="col" className="w-28 px-3 py-2">
                    Kind
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Note
                  </th>
                  <th scope="col" className="w-40 px-3 py-2">
                    Written by
                  </th>
                  <th scope="col" className="w-36 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((note) => (
                  <tr key={note.id} data-testid="staff-note" className="align-top">
                    <td className="px-3 py-2 text-slate-700">{formatDate(note.createdAt)}</td>
                    <td className="break-words px-3 py-2 font-medium text-slate-900">
                      <button
                        type="button"
                        className="text-left underline decoration-slate-300 hover:decoration-brand-600"
                        onClick={() => choosePerson(note.person.id)}
                      >
                        {note.person.name}
                      </button>
                      {note.person.former && (
                        <span className="ml-1">
                          <Badge>Former</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {note.kind ? (
                        <Badge tone={KIND_TONES[note.kind]}>{KIND_LABELS[note.kind]}</Badge>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-pre-line break-words px-3 py-2 text-slate-800">
                      {note.body}
                      {note.editedAt && (
                        <span className="mt-1 block text-xs text-slate-500">
                          Edited {formatDateTime(note.editedAt)}
                        </span>
                      )}
                    </td>
                    <td className="break-words px-3 py-2 text-slate-700">
                      {note.author?.name ?? 'Somebody no longer here'}
                    </td>
                    <td className="px-3 py-2">
                      <NoteActions
                        note={note}
                        onEdit={() => setForm({ note })}
                        onRemove={() => void remove(note)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-3 lg:hidden">
            {shown.map((note) => (
              <li key={note.id}>
                <Card className="p-4" testId="staff-note-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="font-medium text-slate-900 underline decoration-slate-300"
                      onClick={() => choosePerson(note.person.id)}
                    >
                      {note.person.name}
                    </button>
                    {note.person.former && <Badge>Former</Badge>}
                    {note.kind && (
                      <Badge tone={KIND_TONES[note.kind]}>{KIND_LABELS[note.kind]}</Badge>
                    )}
                    <span className="ml-auto text-xs text-slate-500">
                      {formatDate(note.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-800">
                    {note.body}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    By {note.author?.name ?? 'somebody no longer here'}
                    {note.editedAt && ` · edited ${formatDateTime(note.editedAt)}`}
                  </p>
                  <div className="mt-2">
                    <NoteActions
                      note={note}
                      onEdit={() => setForm({ note })}
                      onRemove={() => void remove(note)}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {form && (
        <NoteForm
          note={form.note}
          people={data.people}
          initialPerson={person}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            setNotice(message);
            load();
          }}
        />
      )}
    </div>
  );
}

function NoteActions({
  note,
  onEdit,
  onRemove,
}: {
  note: StaffNote;
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!note.canEdit && !note.canRemove) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {note.canEdit && (
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={onEdit}
          aria-label={`Edit the note about ${note.person.name}`}
        >
          Edit
        </button>
      )}
      {note.canRemove && (
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={onRemove}
          aria-label={`Remove the note about ${note.person.name}`}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function NoteForm({
  note,
  people,
  initialPerson,
  onClose,
  onSaved,
}: {
  note?: StaffNote;
  people: StaffNoteList['people'];
  initialPerson: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(note?.person.id ?? initialPerson);
  const [kind, setKind] = useState<StaffNoteKind | ''>(note?.kind ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const who = people.find((p) => p.id === employeeId);

  const save = async () => {
    if (!employeeId) return setError('Choose who the note is about.');
    if (!body.trim()) return setError('Write the note.');
    setSaving(true);
    setError(null);
    try {
      if (note) {
        await api.changeStaffNote(note.id, { kind: kind || null, body });
        onSaved('Your note was changed.');
      } else {
        await api.addStaffNote({ employeeId, kind: kind || null, body });
        onSaved(`Note saved on ${who?.name ?? 'them'}.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the note.');
      setSaving(false);
    }
  };

  return (
    <Modal
      title={note ? `Edit the note about ${note.person.name}` : 'Add a confidential note'}
      onClose={onClose}
      testId="staff-note-form"
    >
      <p className="text-sm text-slate-600">
        Only managers and admins can read it, never the person it is about. Write facts about work:
        never a patient&rsquo;s details, and nothing about anybody&rsquo;s health.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {note ? (
          <p className="text-sm text-slate-700">
            About <strong>{note.person.name}</strong>
          </p>
        ) : (
          <SearchableSelect
            label="About"
            value={employeeId}
            placeholder="Type a name"
            options={people
              .filter((p) => !p.former || p.id === employeeId)
              .map((p) => ({ value: p.id, label: p.name }))}
            onChange={setEmployeeId}
          />
        )}
        <Field label="Kind (optional)">
          {(props) => (
            <select
              {...props}
              className={inputClass}
              value={kind}
              onChange={(event) => setKind(event.target.value as StaffNoteKind | '')}
            >
              <option value="">None</option>
              {KINDS.map((key) => (
                <option key={key} value={key}>
                  {KIND_LABELS[key]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Note" hint={`${body.length} of ${MAX_LENGTH} characters`}>
          {(props) => (
            <textarea
              {...props}
              className={`${inputClass} min-h-32`}
              maxLength={MAX_LENGTH}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonClass('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={saving}>
            {saving ? 'Saving…' : note ? 'Save changes' : 'Save note'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
