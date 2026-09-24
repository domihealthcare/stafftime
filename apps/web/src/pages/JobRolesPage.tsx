import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName } from '../lib/format';
import { JOB_ROLE_COLOURS, JOB_ROLE_COLOUR_KEYS, jobRoleHex as jobRoleHexFor } from '../lib/job-role-colours';
import { JobRoleDot } from '../components/JobRoleTag';
import type { Employee, JobRole } from '../lib/types';

/**
 * What people do at the practice, and who does it.
 *
 * Managers keep this. Somebody can be in several — a front desk colleague who
 * also rooms patients is in Front Desk and Medical Assistant — and it decides
 * which resources they see. It does not change what they may do in the app:
 * that is their access level on the Staff screen.
 */
export function JobRolesPage() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, people] = await Promise.all([api.jobRoles(), api.listEmployees()]);
      setRoles(rows);
      setStaff(people.filter((person) => person.employmentStatus !== 'TERMINATED'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the job roles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /// A single role changed — swap it in rather than reloading everything, so
  /// adding five people to Front Desk does not flicker the page five times.
  const replace = (updated: JobRole) =>
    setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));

  if (loading) return <Spinner label="Loading job roles" />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading
        title="Job roles"
        subtitle="What people do here. Someone can be in more than one, and each role has its own resources."
      />

      <div className="mb-4">
        <Alert tone="info">
          A job role decides which{' '}
          <Link to="/resources" className="font-medium underline">
            resources
          </Link>{' '}
          someone sees — nothing else. Being in <em>Administrative</em> or <em>Manager</em> here
          does not let anyone approve hours or change settings; that is their access level, set by
          an admin on the Staff screen.
        </Alert>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-4">
        {adding ? (
          <RoleForm
            used={roles.map((role) => role.colour)}
            onSaved={() => {
              setAdding(false);
              void load();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + New job role
          </button>
        )}
      </div>

      {roles.length === 0 ? (
        <EmptyState>No job roles yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              staff={staff}
              onChanged={replace}
              onDeleted={() => void load()}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({
  role,
  staff,
  onChanged,
  onDeleted,
  onError,
}: {
  role: JobRole;
  staff: Employee[];
  onChanged: (role: JobRole) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState('');
  const confirm = useConfirm();

  async function act<T>(action: () => Promise<T>, then: (result: T) => void, failure: string) {
    setBusy(true);
    try {
      then(await action());
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const memberIds = new Set(role.members.map((member) => member.id));
  const candidates = staff.filter((person) => !memberIds.has(person.id));

  if (editing) {
    return (
      <RoleForm
        role={role}
        used={[]}
        onSaved={(updated) => {
          setEditing(false);
          if (updated) onChanged(updated);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card
      className="border-l-4 p-4"
      testId={`job-role-${role.name}`}
      style={{ borderLeftColor: jobRoleHexFor(role.colour) }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <JobRoleDot colour={role.colour} />
            {role.name}
          </h2>
          {role.description && <p className="text-sm text-slate-600">{role.description}</p>}
          <p className="mt-0.5 text-xs text-slate-500">
            {role.members.length === 1 ? '1 person' : `${role.members.length} people`} ·{' '}
            {role.resourceCount === 1 ? '1 resource' : `${role.resourceCount} resources`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const sure = await confirm({
                title: `Delete the ${role.name} job role?`,
                body:
                  role.members.length > 0
                    ? `${role.members.length} ${role.members.length === 1 ? 'person is' : 'people are'} in it; they come out of it. Their access and shifts do not change.`
                    : 'Nobody is in it.',
                confirmLabel: 'Delete it',
                cancelLabel: 'Keep it',
              });
              if (sure)
                await act(() => api.deleteJobRole(role.id), onDeleted, 'Could not delete that.');
            }}
            className="font-medium text-slate-400 hover:text-rose-700"
          >
            Delete
          </button>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {role.members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800"
          >
            {displayName(member)}
            <button
              type="button"
              disabled={busy}
              aria-label={`Take ${displayName(member)} out of ${role.name}`}
              onClick={async () => {
                const sure = await confirm({
                  title: `Take ${displayName(member)} out of ${role.name}?`,
                  body: `They stop seeing ${role.name}’s resources. Their access and shifts do not change.`,
                  confirmLabel: 'Take them out',
                  cancelLabel: 'Keep them in',
                });
                if (!sure) return;
                await act(
                  () => api.removeJobRoleMember(role.id, member.id),
                  onChanged,
                  'Could not take them out.',
                );
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              ×
            </button>
          </li>
        ))}
        {role.members.length === 0 && (
          <li className="text-sm text-slate-500">Nobody is in this role yet.</li>
        )}
      </ul>

      {candidates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label={`Add someone to ${role.name}`}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Add someone…</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || choice === ''}
            onClick={() =>
              void act(
                () => api.addJobRoleMember(role.id, choice),
                (updated) => {
                  setChoice('');
                  onChanged(updated);
                },
                'Could not add them.',
              )
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}
    </Card>
  );
}

function RoleForm({
  role,
  used,
  onSaved,
  onCancel,
}: {
  role?: JobRole;
  /// Colours other roles already wear, so a new one starts on a free colour.
  used: string[];
  onSaved: (role?: JobRole) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [colour, setColour] = useState(
    role?.colour ?? JOB_ROLE_COLOUR_KEYS.find((key) => !used.includes(key)) ?? JOB_ROLE_COLOUR_KEYS[0],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim(), colour };
      onSaved(role ? await api.updateJobRole(role.id, body) : await api.createJobRole(body));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Name</span>
          <input
            aria-label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Billing"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            aria-label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-slate-700">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {JOB_ROLE_COLOUR_KEYS.map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                colour === key
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name={`colour-${role?.id ?? 'new'}`}
                value={key}
                checked={colour === key}
                onChange={() => setColour(key)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full ring-1 ring-white"
                style={{ backgroundColor: JOB_ROLE_COLOURS[key].hex }}
              />
              {JOB_ROLE_COLOURS[key].label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || name.trim().length < 2}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : role ? 'Save' : 'Create it'}
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
