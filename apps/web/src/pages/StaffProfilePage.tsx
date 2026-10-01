import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCalendarDate, formatDateTime } from '../lib/format';
import { ApiError, api } from '../lib/api';
import { formatBirthday } from '../lib/birthday';
import { useSession } from '../lib/session';
import type {
  Employee,
  JobRole,
  Location,
  PersonalRecordFields,
  PtoBalance,
  PtoRequest,
  StaffRecord,
} from '../lib/types';
import { Avatar } from '../components/Avatar';
import { EmploymentHistoryCard } from '../components/EmploymentHistoryCard';
import { JobRoleTag } from '../components/JobRoleTag';
import { ROLE_LABELS, StaffEditor } from '../components/StaffEditor';
import { StaffTimeOffCard } from '../components/StaffTimeOffCard';
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

interface Loaded {
  person: Employee;
  record: StaffRecord;
  requests: PtoRequest[];
  balance: PtoBalance | null;
  locations: Location[];
  jobRoles: JobRole[];
}

/**
 * Everything the practice keeps about one person, on one page (October 2026,
 * Dominguez): contact details, address and emergency contact, employment,
 * pay and position over time, and time off. **Admins only** — opened from a
 * name on the Staff screen. The address, emergency contact and pay are kept
 * nowhere else in the app and shown nowhere else.
 */
export function StaffProfilePage() {
  const { id = '' } = useParams();
  const { employee: me } = useSession();
  const isAdmin = me?.role === 'ADMIN';
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [person, record, requests, balance, locations, jobRoles] = await Promise.all([
        api.employee(id),
        api.staffRecord(id),
        api.listPto({ employeeId: id }),
        api.ptoBalance(id).catch(() => null),
        api.listLocations(),
        api.jobRoles(),
      ]);
      setData({ person, record, requests, balance, locations, jobRoles });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this profile.');
    }
  }, [id]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="max-w-3xl">
        <PageHeading title="Staff profile" />
        <Alert tone="warning">Staff profiles are for administrators.</Alert>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl">
        <BackToStaff />
        {error ? (
          <Alert>{error}</Alert>
        ) : (
          <Card className="p-6">
            <Spinner label="Loading profile" />
          </Card>
        )}
      </div>
    );
  }

  const { person, record, requests, balance, locations, jobRoles } = data;
  const heldRoles = jobRoles.filter((jobRole) =>
    jobRole.members.some((member) => member.id === person.id),
  );
  const terminated = person.employmentStatus === 'TERMINATED';
  const isMe = person.id === me?.id;

  return (
    <div className="max-w-3xl space-y-4">
      <BackToStaff />

      <div className="flex flex-wrap items-start gap-4">
        <Avatar person={person} size="xl" />
        <div className="min-w-0 flex-1">
          <PageHeading
            title={`${person.firstName} ${person.lastName}`}
            subtitle={
              person.preferredName && person.preferredName !== person.firstName
                ? `Goes by ${person.preferredName}${person.pronouns ? ` · ${person.pronouns}` : ''}`
                : (person.pronouns ?? undefined)
            }
          />
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={person.role === 'EMPLOYEE' ? 'neutral' : 'info'}>
              {ROLE_LABELS[person.role]} access
            </Badge>
            {terminated && <Badge tone="danger">Former</Badge>}
            {heldRoles.map((jobRole) => (
              <JobRoleTag key={jobRole.id} name={jobRole.name} colour={jobRole.colour} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${buttonClass('secondary', 'md')} max-sm:w-full`}
        >
          Edit details
        </button>
      </div>

      {error && <Alert>{error}</Alert>}

      <p className="text-xs text-slate-600">
        Only administrators can see this page. The address, emergency contact and pay are not shown
        anywhere else in the app — not to managers, not in the Directory, not in the payroll export.
      </p>

      <Card className="p-4" testId="profile-employment">
        <h2 className="text-base font-semibold text-slate-900">Employment</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Detail term="Hire date">
            {person.hireDate ? formatCalendarDate(person.hireDate) : 'Not recorded'}
          </Detail>
          <Detail term="Position now">{record.current.position?.value ?? 'Not recorded'}</Detail>
          <Detail term="Pay type">{person.payType === 'SALARY' ? 'Salary' : 'Hourly'}</Detail>
          <Detail term="Offices">
            {person.locations.map((l) => l.location.name).join(', ') || 'None assigned'}
          </Detail>
          <Detail term="ADP File #">{person.adpFileNumber ?? 'Not entered'}</Detail>
          {person.terminationDate && (
            <Detail term="Last day">{formatCalendarDate(person.terminationDate)}</Detail>
          )}
          {person.birthdayMonth && person.birthdayDay && (
            <Detail term="Birthday">
              {formatBirthday(person.birthdayMonth, person.birthdayDay)}
            </Detail>
          )}
        </dl>
      </Card>

      <ContactCard
        person={person}
        record={record}
        onSaved={(next) => setData((current) => current && { ...current, record: next })}
      />

      <EmploymentHistoryCard
        employeeId={person.id}
        record={record}
        hireDate={person.hireDate ?? null}
        onChanged={(next) => setData((current) => current && { ...current, record: next })}
      />

      <StaffTimeOffCard
        employeeId={person.id}
        firstName={person.preferredName ?? person.firstName}
        isMe={isMe}
        balance={balance}
        requests={requests}
        onChanged={() => void load()}
      />

      {editing && (
        <StaffEditor
          person={person}
          locations={locations}
          jobRoles={jobRoles}
          isMe={isMe}
          onClose={() => setEditing(false)}
          onChanged={() => void load()}
          onLeft={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function BackToStaff() {
  return (
    <Link
      to="/staff"
      className="tap inline-block text-sm font-medium text-brand-700 hover:underline"
    >
      ← Staff
    </Link>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-600">{term}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}

const ADDRESS_FIELDS: { key: keyof PersonalRecordFields; label: string; max: number }[] = [
  { key: 'addressLine1', label: 'Street address', max: 200 },
  { key: 'addressLine2', label: 'Apartment, suite (optional)', max: 200 },
  { key: 'city', label: 'City', max: 100 },
  { key: 'state', label: 'State', max: 50 },
  { key: 'postalCode', label: 'ZIP code', max: 20 },
];

const EMERGENCY_FIELDS: { key: keyof PersonalRecordFields; label: string; max: number }[] = [
  { key: 'emergencyContactName', label: 'Name', max: 200 },
  { key: 'emergencyContactRelationship', label: 'Relationship', max: 100 },
  { key: 'emergencyContactPhone', label: 'Phone', max: 50 },
];

function ContactCard({
  person,
  record,
  onSaved,
}: {
  person: Employee;
  record: StaffRecord;
  onSaved: (record: StaffRecord) => void;
}) {
  const { personal } = record;
  const [editing, setEditing] = useState(false);
  const blank = () =>
    Object.fromEntries(
      [...ADDRESS_FIELDS, ...EMERGENCY_FIELDS].map(({ key }) => [key, personal[key] ?? '']),
    ) as Record<keyof PersonalRecordFields, string>;
  const [values, setValues] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const cityLine = [[personal.city, personal.state].filter(Boolean).join(', '), personal.postalCode]
    .filter(Boolean)
    .join(' ');
  const addressLines = [personal.addressLine1, personal.addressLine2, cityLine].filter(Boolean);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await api.updatePersonalRecord(person.id, values));
      setEditing(false);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  const input = (key: keyof PersonalRecordFields, label: string, max: number) => (
    <Field key={key} label={label}>
      {(props) => (
        <input
          {...props}
          type={key === 'emergencyContactPhone' ? 'tel' : 'text'}
          maxLength={max}
          value={values[key]}
          onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <Card className="p-4" testId="profile-contact">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Contact</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValues(blank());
              setEditing(true);
            }}
            className={buttonClass('secondary', 'sm')}
          >
            Edit address and emergency contact
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={(event) => void save(event)} className="mt-3 space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Home address</legend>
            {ADDRESS_FIELDS.map(({ key, label, max }) => input(key, label, max))}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Emergency contact</legend>
            {EMERGENCY_FIELDS.map(({ key, label, max }) => input(key, label, max))}
          </fieldset>
          {problem && <Alert>{problem}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={buttonClass('secondary', 'sm')}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Detail term="Work email">{person.email}</Detail>
            <Detail term="Phone">{person.phone ?? 'Not given'}</Detail>
            <Detail term="Home address">
              {addressLines.length > 0 ? (
                <span data-testid="home-address">
                  {addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              ) : (
                'Not recorded'
              )}
            </Detail>
            <Detail term="Emergency contact">
              {personal.emergencyContactName ? (
                <span data-testid="emergency-contact">
                  <span className="block">
                    {personal.emergencyContactName}
                    {personal.emergencyContactRelationship &&
                      ` (${personal.emergencyContactRelationship})`}
                  </span>
                  {personal.emergencyContactPhone && (
                    <span className="block">{personal.emergencyContactPhone}</span>
                  )}
                </span>
              ) : (
                'Not recorded'
              )}
            </Detail>
          </dl>
          {personal.updatedAt && (
            <p className="mt-3 text-xs text-slate-500">
              Address and emergency contact last changed {formatDateTime(personal.updatedAt)}
              {personal.updatedBy ? ` by ${personal.updatedBy}` : ''}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
