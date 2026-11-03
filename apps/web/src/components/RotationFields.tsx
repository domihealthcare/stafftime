import { useEffect, useId, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { describeStudent, STUDENT_KINDS } from '../lib/practice-events';
import type { Student, StudentKind } from '../lib/types';
import { useConfirm } from './ConfirmDialog';
import { SearchableSelect } from './SearchableSelect';
import { buttonClass } from './ui';

/**
 * The student and the provider on a student rotation date (November 2026,
 * Dominguez: "we have students/residents who do rotations at our office(s)
 * with specific providers"). The student is picked from the managers' list -
 * typed into to find them - or added right here; the provider from the
 * people in a provider job role. Names only: nothing to reach a student by.
 */
export function RotationFields({
  studentId,
  onStudent,
  providerId,
  onProvider,
}: {
  studentId: string;
  onStudent: (id: string) => void;
  providerId: string;
  onProvider: (id: string) => void;
}) {
  const id = useId();
  const confirm = useConfirm();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [providers, setProviders] = useState<{ id: string; name: string }[] | null>(null);
  /// The student form: a new one (with the name typed so far), or the chosen
  /// one being corrected. Null while closed.
  const [editing, setEditing] = useState<{ student: Student | null; name: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .students()
      .then((found) => !cancelled && setStudents(found))
      .catch(() => !cancelled && setStudents([]));
    api
      .studentProviders()
      .then((found) => !cancelled && setProviders(found))
      .catch(() => !cancelled && setProviders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = students?.find((student) => student.id === studentId) ?? null;

  async function removeChosen() {
    if (!chosen) return;
    const sure = await confirm({
      title: `Take ${chosen.name} off the students list?`,
      body: 'Dates already on the calendar keep their name.',
      confirmLabel: 'Take off the list',
    });
    if (!sure) return;
    try {
      await api.deleteStudent(chosen.id);
      setStudents((current) => (current ?? []).filter((one) => one.id !== chosen.id));
      onStudent('');
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : 'Could not take them off the list.');
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';
  return (
    <>
      <div className="sm:col-span-2">
        <SearchableSelect
          id={`${id}-student`}
          label="Which student or resident?"
          value={studentId}
          placeholder={students === null ? 'Loading…' : 'Type a name or school…'}
          options={(students ?? []).map((student) => ({
            value: student.id,
            label: `${student.name} - ${describeStudent(student)}`,
          }))}
          onChange={onStudent}
          footer={(close, typed) => (
            <button
              type="button"
              onClick={() => {
                close();
                setEditing({ student: null, name: typed.trim() });
              }}
              className="w-full rounded-md px-3 py-1.5 text-left text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              + Add a new student
            </button>
          )}
        />
        {editing ? (
          <StudentForm
            student={editing.student}
            startName={editing.name}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setStudents((current) =>
                [...(current ?? []).filter((one) => one.id !== saved.id), saved].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
              );
              onStudent(saved.id);
              setEditing(null);
            }}
          />
        ) : chosen ? (
          <p className="mt-1 text-xs text-slate-600" data-testid="chosen-student">
            {describeStudent(chosen)} ·{' '}
            <button
              type="button"
              onClick={() => setEditing({ student: chosen, name: chosen.name })}
              className="font-medium text-brand-700 underline"
            >
              Change their details
            </button>{' '}
            ·{' '}
            <button
              type="button"
              onClick={() => void removeChosen()}
              className="font-medium text-brand-700 underline"
            >
              Take off the list
            </button>
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Not on the list?{' '}
            <button
              type="button"
              onClick={() => setEditing({ student: null, name: '' })}
              className="font-medium text-brand-700 underline"
            >
              Add a new student
            </button>{' '}
            here. Only their name, what they are and their school are kept.
          </p>
        )}
        {problem && <p className="mt-1 text-xs text-rose-700">{problem}</p>}
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={`${id}-provider`} className="block text-sm font-medium text-slate-700">
          With which provider?
        </label>
        <select
          id={`${id}-provider`}
          required
          value={providerId}
          onChange={(change) => onProvider(change.target.value)}
          className={field}
        >
          <option value="">{providers === null ? 'Loading…' : 'Choose the provider'}</option>
          {(providers ?? []).map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Each date can have its own provider, office and hours: add another date for a different
          one.
        </p>
      </div>
    </>
  );
}

/// Adding a student, or correcting the chosen one: name, what they are,
/// school. Saved at once, so it can be picked.
function StudentForm({
  student,
  startName,
  onSaved,
  onCancel,
}: {
  student: Student | null;
  startName: string;
  onSaved: (student: Student) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(startName);
  const [kind, setKind] = useState<StudentKind>(student?.kind ?? 'MEDICAL_STUDENT');
  const [school, setSchool] = useState(student?.school ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = 'mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

  async function save() {
    if (name.trim().length < 2) {
      setProblem('Give the student’s name.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const body = { name: name.trim(), kind, school: school.trim() || undefined };
    try {
      onSaved(student ? await api.updateStudent(student.id, body) : await api.createStudent(body));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save the student.');
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
      data-testid="student-form"
    >
      <p className="text-sm font-medium text-slate-900">
        {student ? `Change ${student.name}` : 'New student'}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-slate-600" htmlFor={`${id}-name`}>
          Name
          <input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className={box}
          />
        </label>
        <label className="text-xs text-slate-600" htmlFor={`${id}-kind`}>
          They are a
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as StudentKind)}
            className={`${box} bg-white`}
          >
            {STUDENT_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600" htmlFor={`${id}-school`}>
          School or program <span className="text-slate-500">(optional)</span>
          <input
            id={`${id}-school`}
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            maxLength={160}
            placeholder="Rutgers NJMS, 3rd year"
            className={box}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        No phone, email, date of birth or paperwork: the school keeps those.
      </p>
      {problem && <p className="mt-1 text-xs text-rose-700">{problem}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className={buttonClass('primary', 'sm')}
        >
          {busy ? 'Saving…' : student ? 'Save' : 'Add student'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
