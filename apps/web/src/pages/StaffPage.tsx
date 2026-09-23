import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Employee, Location, Role } from '../lib/types';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { PASSWORD_RULE, meetsPasswordRule } from '../lib/password';

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
};

/// Admin screen for adding staff and giving them a way in. Without this the
/// only route to a second account is the API by hand.
export function StaffPage() {
  const { employee: me } = useSession();
  const [staff, setStaff] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showTerminated, setShowTerminated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staffData, locationData] = await Promise.all([
        api.listEmployees(),
        api.listLocations(),
      ]);
      setStaff(staffData);
      setLocations(locationData);
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
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {adding ? 'Cancel' : '+ Add someone'}
        </button>
      </div>

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
              locations={locations}
              isMe={person.id === me?.id}
              onChanged={() => void load()}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({
  person,
  locations,
  isMe,
  onChanged,
  onError,
}: {
  person: Employee;
  locations: Location[];
  isMe: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [temporary, setTemporary] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(person.role);
  const [assigned, setAssigned] = useState<string[]>(person.locations.map((l) => l.locationId));
  const [fileNumber, setFileNumber] = useState(person.adpFileNumber ?? '');

  const terminated = person.employmentStatus === 'TERMINATED';

  async function issuePassword() {
    setBusy(true);
    setProblem(null);
    try {
      await api.setTemporaryPassword(person.id, temporary);
      setIssued(temporary);
      setTemporary('');
      setSettingPassword(false);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not set that password.');
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    setBusy(true);
    setProblem(null);
    try {
      await api.updateEmployee(person.id, {
        role,
        locationIds: assigned,
        primaryLocationId: assigned[0],
        adpFileNumber: fileNumber.trim() || null,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that change.');
    } finally {
      setBusy(false);
    }
  }

  async function terminate() {
    if (
      !window.confirm(
        `Mark ${person.firstName} ${person.lastName} as no longer employed? Their sign-in stops working immediately. Their timesheets are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.terminateEmployee(person.id);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card testId={`staff-${person.email}`} className={`p-4 ${terminated ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">
            {person.firstName} {person.lastName}
            {isMe && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
          </p>
          <p className="text-sm text-slate-600">{person.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            {person.locations.map((l) => l.location.name).join(', ') || 'No location assigned'}
          </p>
          {!terminated && (
            <p className="text-xs text-slate-500">
              {person.adpFileNumber ? `ADP File # ${person.adpFileNumber}` : 'No ADP File # yet'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={person.role === 'EMPLOYEE' ? 'neutral' : 'info'}>
            {ROLE_LABELS[person.role]}
          </Badge>
          {terminated && <Badge tone="danger">Former</Badge>}
          {person.hasKioskPin && <Badge tone="success">PIN</Badge>}
        </div>
      </div>

      {!terminated && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
          <button
            type="button"
            onClick={() => setSettingPassword((open) => !open)}
            className="font-medium text-slate-600 hover:text-slate-900"
          >
            {settingPassword ? 'Cancel' : 'Set a temporary password'}
          </button>
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="font-medium text-slate-600 hover:text-slate-900"
          >
            {editing ? 'Cancel' : 'Role, locations and ADP'}
          </button>
          {/* Terminating yourself would lock you out of your own practice. */}
          {!isMe && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void terminate()}
              className="ml-auto font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
            >
              No longer employed
            </button>
          )}
        </div>
      )}

      {issued && (
        <div className="mt-3">
          <Alert tone="success">
            <p className="font-medium">
              Temporary password for {person.firstName}: <span className="font-mono">{issued}</span>
            </p>
            <p className="mt-1 text-xs">
              Give it to them by phone or in person, not in the same message as the link. They must
              change it the first time they sign in. This is the only time it is shown.
            </p>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className="mt-2 text-xs font-medium underline"
            >
              Got it
            </button>
          </Alert>
        </div>
      )}

      {settingPassword && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label htmlFor={`temp-${person.id}`} className="block text-sm font-medium text-slate-700">
            Temporary password
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id={`temp-${person.id}`}
              type="text"
              autoFocus
              value={temporary}
              onChange={(event) => setTemporary(event.target.value)}
              className="w-full max-w-xs rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
            <button
              type="button"
              onClick={() => setTemporary(suggestPassword())}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Suggest one
            </button>
            <button
              type="button"
              disabled={busy || !meetsPasswordRule(temporary)}
              onClick={() => void issuePassword()}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Set it'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {PASSWORD_RULE} Signs them out everywhere and forces a change at next sign-in.
          </p>
          {problem && (
            <div className="mt-2">
              <Alert>{problem}</Alert>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label htmlFor={`role-${person.id}`} className="block text-sm font-medium text-slate-700">
            Role
          </label>
          <select
            id={`role-${person.id}`}
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="mt-1 w-full max-w-xs rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label
            htmlFor={`adp-${person.id}`}
            className="mt-3 block text-sm font-medium text-slate-700"
          >
            ADP File #
          </label>
          <input
            id={`adp-${person.id}`}
            value={fileNumber}
            onChange={(event) => setFileNumber(event.target.value)}
            maxLength={10}
            inputMode="text"
            autoComplete="off"
            className="mt-1 w-full max-w-[10rem] rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            Their number in ADP TotalSource — on the worksheet you export from ADP. Their hours
            cannot go in the ADP import file without it.
          </p>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-slate-700">Locations</legend>
            <p className="text-xs text-slate-500">
              They can only clock in where they are assigned.
            </p>
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
          </fieldset>

          {problem && (
            <div className="mt-2">
              <Alert>{problem}</Alert>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveChanges()}
            className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </Card>
  );
}

function AddStaffForm({ locations, onCreated }: { locations: Location[]; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [payType, setPayType] = useState('HOURLY');
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10));
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
        hireDate,
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
              Role
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
            required
            value={hireDate}
            onChange={(event) => setHireDate(event.target.value)}
            className={field}
          />
          <p className="mt-1 text-xs text-slate-500">Used to work out their first-year PTO.</p>
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

const WORDS = [
  'harbour',
  'lantern',
  'copper',
  'tuesday',
  'meadow',
  'pebble',
  'anchor',
  'willow',
  'cinder',
  'marble',
  'thicket',
  'quarry',
  'saffron',
  'drifting',
];

/// A temporary password the admin can read aloud over the phone: two words and
/// a number, e.g. "copper-meadow-42" — which meets the 8-characters-and-a-number
/// rule with room to spare.
function suggestPassword(): string {
  const picked: string[] = [];
  const pool = [...WORDS];
  for (let i = 0; i < 2; i += 1) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return `${picked.join('-')}-${Math.floor(Math.random() * 90 + 10)}`;
}
