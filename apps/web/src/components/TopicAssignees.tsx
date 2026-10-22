import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import type { DigestTopic, Employee } from '../lib/types';
import { Alert, Card, Spinner, buttonClass } from './ui';

/**
 * Who looks after one part of the practice (October 2026, Dominguez: "assign
 * staff ... to being notified and clearing/approving checklists"; "I don't
 * want to always be notified of PTO requests, that should be a setting to who
 * it notifies"): tick the managers and admins. A part with anybody ticked
 * goes to them alone - its bell notes as things happen and its section of the
 * nightly round-up; with nobody ticked, Email settings decide as before. Shown
 * on the screen each part belongs to; the same list is read on Email settings.
 */
export function TopicAssignees({
  topic,
  title,
  intro,
  onSaved,
}: {
  topic: DigestTopic;
  title: string;
  /// What being chosen for this part means, in that part's own words.
  intro: ReactNode;
  onSaved?: (employeeIds: string[]) => void;
}) {
  const [people, setPeople] = useState<Employee[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listEmployees(), api.topicAssignees()])
      .then(([staff, assignees]) => {
        if (cancelled) return;
        setPeople(
          staff.filter(
            (person) =>
              person.employmentStatus !== 'TERMINATED' &&
              (person.role === 'MANAGER' || person.role === 'ADMIN'),
          ),
        );
        setChosen(new Set(assignees[topic] ?? []));
        setSaved(new Set(assignees[topic] ?? []));
      })
      .catch(
        (err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load.'),
      );
    return () => {
      cancelled = true;
    };
  }, [topic]);

  const changed = chosen.size !== saved.size || [...chosen].some((id) => !saved.has(id));

  async function save() {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const result = await api.saveTopicAssignees(topic, [...chosen]);
      setChosen(new Set(result.employeeIds));
      setSaved(new Set(result.employeeIds));
      setNote('Saved.');
      onSaved?.(result.employeeIds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (!people) return error ? <Alert>{error}</Alert> : <Spinner label="Loading" />;

  return (
    <Card className="p-4" testId={`topic-assignees-${topic}`}>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <div className="mt-1 text-sm text-slate-600">{intro}</div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={chosen.has(person.id)}
                onChange={(event) =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(person.id);
                    else next.delete(person.id);
                    return next;
                  })
                }
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              <span>
                {person.firstName} {person.lastName}
                <span className="ml-1 text-xs text-slate-500">
                  ({person.role === 'ADMIN' ? 'Admin' : 'Manager'})
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {people.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">No managers or admins to choose from.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !changed}
          onClick={() => void save()}
          className={buttonClass('primary', 'md')}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {note && (
          <span className="text-sm text-emerald-700" role="status">
            {note}
          </span>
        )}
        {chosen.size === 0 && (
          <span className="text-sm text-slate-500">
            Nobody chosen: it goes by Email settings, as before.
          </span>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
