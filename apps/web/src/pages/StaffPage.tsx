import { useCallback, useEffect, useState } from 'react';
import { localDate } from '../lib/format';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Employee, JobRole, Location, Role } from '../lib/types';
import { useConfirm } from '../components/ConfirmDialog';
import { ImportStaff } from '../components/ImportStaff';
import { JobRoleTag } from '../components/JobRoleTag';
import { ROLE_LABELS, StaffEditor } from '../components/StaffEditor';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';

/// Admin screen for adding staff and giving them a way in. Without this the
/// only route to a second account is the API by hand.
export function StaffPage() {
  const { employee: me } = useSession();
  const [staff, setStaff] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [welcoming, setWelcoming] = useState(false);
  const [welcomeReport, setWelcomeReport] = useState<{ sent: number; failed: string[] } | null>(
    null,
  );
  const confirm = useConfirm();
  const [showTerminated, setShowTerminated] = useState(false);
  /// Whose details are open in the editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const editing = staff.find((person) => person.id === editingId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staffData, locationData, roleData] = await Promise.all([
        api.listEmployees(),
        api.listLocations(),
        api.jobRoles(),
      ]);
      setStaff(staffData);
      setLocations(locationData);
      setJobRoles(roleData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = staff.filter(
    (person) =>
      person.employmentStatus !== 'TERMINATED' &&
      person.hasPassword === false &&
      !person.welcomeSentAt &&
      !person.externalId?.startsWith('demo:'),
  );

  async function welcomeEveryone() {
    const sure = await confirm({
      title: `Send welcome emails to ${waiting.length} ${waiting.length === 1 ? 'person' : 'people'}?`,
      body: 'Each gets a link to choose their password — good for a week — with how to put Domi Staff on their phone and answers to the usual first-day questions. People who already have a password or have already been sent one are left out.',
      confirmLabel: 'Send them',
      cancelLabel: 'Not yet',
      tone: 'neutral',
    });
    if (!sure) return;
    setWelcoming(true);
    setWelcomeReport(null);
    let sent = 0;
    const failed: string[] = [];
    try {
      // The server sends in batches, so a big list is a few calls.
      for (let round = 0; round < 20; round += 1) {
        const result = await api.sendWelcomeToEveryone();
        sent += result.sent;
        failed.push(...result.failed.map((f) => `${f.name} (${f.email}): ${f.reason}`));
        if (result.remaining === 0 || result.sent === 0) break;
      }
      setWelcomeReport({ sent, failed });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the welcome emails.');
    } finally {
      setWelcoming(false);
      void load();
    }
  }

  const visible = staff.filter(
    (person) => showTerminated || person.employmentStatus !== 'TERMINATED',
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Staff"
        subtitle="Who works here, what they can see, and how they sign in."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showTerminated}
            onChange={(event) => setShowTerminated(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Show former staff
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setImporting((open) => !open);
              setAdding(false);
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {importing ? 'Cancel' : 'Add several people'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding((open) => !open);
              setImporting(false);
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {adding ? 'Cancel' : '+ Add someone'}
          </button>
        </div>
      </div>

      {left && (
        <div className="mb-4">
          <Alert tone="success">
            {left} is marked as no longer employed. If that was a mistake, tick{' '}
            <strong>Show former staff</strong>, press <strong>Edit</strong> on their card and bring
            them back.
          </Alert>
        </div>
      )}

      {imported !== null && (
        <div className="mb-4">
          <Alert tone="success">
            {imported} {imported === 1 ? 'person' : 'people'} added. Nobody has been emailed yet —
            send the welcome emails when you are ready.
          </Alert>
        </div>
      )}

      {waiting.length > 0 && !loading && (
        <Card
          className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4"
          testId="welcome-everyone"
        >
          <p className="text-sm text-slate-700">
            <strong>
              {waiting.length} {waiting.length === 1 ? 'person has' : 'people have'}
            </strong>{' '}
            not been sent a welcome email — the link to choose their password, with how to put Domi
            Staff on their phone.
          </p>
          <button
            type="button"
            disabled={welcoming}
            onClick={() => void welcomeEveryone()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {welcoming ? 'Sending…' : 'Send welcome emails'}
          </button>
        </Card>
      )}

      {welcomeReport && (
        <div className="mb-4">
          <Alert tone={welcomeReport.failed.length > 0 ? 'warning' : 'success'}>
            <p>
              {welcomeReport.sent} welcome {welcomeReport.sent === 1 ? 'email' : 'emails'} sent.
            </p>
            {welcomeReport.failed.length > 0 && (
              <>
                <p className="mt-1 font-medium">Not sent:</p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {welcomeReport.failed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </Alert>
        </div>
      )}

      {importing && (
        <div className="mb-4">
          <ImportStaff
            locations={locations}
            existingEmails={staff.map((person) => person.email)}
            onImported={(count) => {
              setImporting(false);
              setImported(count);
              void load();
            }}
          />
        </div>
      )}

      {adding && (
        <div className="mb-4">
          <AddStaffForm
            locations={locations}
            onCreated={() => {
              setAdding(false);
              void load();
            }}
          />
        </div>
      )}

      {loading ? (
        <Card className="p-6">
          <Spinner label="Loading staff" />
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState>Nobody here yet. Add your managers to get started.</EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((person) => (
            <StaffCard
              key={person.id}
              person={person}
              jobRoles={jobRoles}
              isMe={person.id === me?.id}
              onEdit={() => {
                setLeft(null);
                setEditingId(person.id);
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <StaffEditor
          key={editing.id}
          person={editing}
          locations={locations}
          jobRoles={jobRoles}
          isMe={editing.id === me?.id}
          onClose={() => setEditingId(null)}
          onChanged={() => void load()}
          onLeft={() => {
            setLeft(`${editing.firstName} ${editing.lastName}`);
            setEditingId(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function StaffCard({
  person,
  jobRoles,
  isMe,
  onEdit,
}: {
  person: Employee;
  /// Every job role, with its members — which of them this person is in.
  jobRoles: JobRole[];
  isMe: boolean;
  onEdit: () => void;
}) {
  const heldRoles = jobRoles.filter((jobRole) =>
    jobRole.members.some((member) => member.id === person.id),
  );
  const terminated = person.employmentStatus === 'TERMINATED';

  return (
    <Card testId={`staff-${person.email}`} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className={`min-w-0 ${terminated ? 'opacity-60' : ''}`}>
          <p className="font-medium text-slate-900">
            {person.firstName} {person.lastName}
            {person.preferredName && person.preferredName !== person.firstName && (
              <span className="ml-1 font-normal text-slate-500">(“{person.preferredName}”)</span>
            )}
            {isMe && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
          </p>
          <p className="text-sm text-slate-600">
            {person.email}
            {person.phone && <span className="text-slate-500"> · {person.phone}</span>}
          </p>
          {heldRoles.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1" data-testid="staff-job-roles">
              {heldRoles.map((jobRole) => (
                <JobRoleTag key={jobRole.id} name={jobRole.name} colour={jobRole.colour} />
              ))}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {person.locations.map((l) => l.location.name).join(', ') || 'No location assigned'}
          </p>
          {!terminated && (
            <p className="text-xs text-slate-500">
              {person.adpFileNumber ? `ADP File # ${person.adpFileNumber}` : 'No ADP File # yet'}
            </p>
          )}
          {!terminated && person.hasPassword === false && (
            <p className="mt-1 text-xs text-amber-800">
              Has not chosen a password yet
              {person.welcomeSentAt
                ? ` · welcome email sent ${new Date(person.welcomeSentAt).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric' },
                  )}`
                : ' · not sent a welcome email'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={person.role === 'EMPLOYEE' ? 'neutral' : 'info'}>
            {ROLE_LABELS[person.role]} access
          </Badge>
          {terminated && <Badge tone="danger">Former</Badge>}
          {person.hasKioskPin && <Badge tone="success">PIN</Badge>}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${person.firstName} ${person.lastName}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        </div>
      </div>
    </Card>
  );
}

function AddStaffForm({ locations, onCreated }: { locations: Location[]; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [payType, setPayType] = useState('HOURLY');
  const [hireDate, setHireDate] = useState(() => localDate(new Date()));
  const [assigned, setAssigned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.createEmployee({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        role,
        payType,
        hireDate: hireDate || undefined,
        locationIds: assigned,
        primaryLocationId: assigned[0],
      });
      onCreated();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not add that person.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';

  return (
    <Card className="p-5">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-first" className="block text-sm font-medium text-slate-700">
              First name
            </label>
            <input
              id="new-first"
              type="text"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="new-last" className="block text-sm font-medium text-slate-700">
              Last name
            </label>
            <input
              id="new-last"
              type="text"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={field}
            />
          </div>
        </div>

        <div>
          <label htmlFor="new-email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={field}
          />
          <p className="mt-1 text-xs text-slate-500">This is how they sign in.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-role" className="block text-sm font-medium text-slate-700">
              Access
            </label>
            <select
              id="new-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className={field}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-pay" className="block text-sm font-medium text-slate-700">
              Pay type
            </label>
            <select
              id="new-pay"
              value={payType}
              onChange={(event) => setPayType(event.target.value)}
              className={field}
            >
              <option value="HOURLY">Hourly</option>
              <option value="SALARY">Salary</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="new-hire" className="block text-sm font-medium text-slate-700">
            Hire date
          </label>
          <input
            id="new-hire"
            type="date"
            value={hireDate}
            onChange={(event) => setHireDate(event.target.value)}
            className={field}
          />
          <p className="mt-1 text-xs text-slate-500">
            Optional. Used to work out their first-year time off; without it they get the whole
            year&rsquo;s.
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Locations</legend>
          <div className="mt-1 space-y-1">
            {locations.map((location) => (
              <label key={location.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assigned.includes(location.id)}
                  onChange={() =>
                    setAssigned((current) =>
                      current.includes(location.id)
                        ? current.filter((id) => id !== location.id)
                        : [...current, location.id],
                    )
                  }
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                {location.name}
              </label>
            ))}
          </div>
          {assigned.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Assign at least one, or they will not be able to clock in anywhere.
            </p>
          )}
        </fieldset>

        {problem && <Alert>{problem}</Alert>}

        <p className="text-xs text-slate-500">
          They cannot sign in until you give them a temporary password, on their card below.
        </p>

        <button
          type="submit"
          disabled={busy || !firstName || !lastName || !email}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {busy ? 'Adding…' : 'Add to staff'}
        </button>
      </form>
    </Card>
  );
}
