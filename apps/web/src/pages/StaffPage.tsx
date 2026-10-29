import { NotSignedInCard } from '../components/NotSignedInCard';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { JobRolesSection } from '../components/JobRolesSection';
import { JobRoleDot } from '../components/JobRoleTag';
import { Modal } from '../components/Modal';
import { browserToday } from '../lib/dates';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import type {
  DirectoryEntry,
  Employee,
  JobRole,
  Location,
  OfficeExtension,
  Role,
  ScheduleReview,
} from '../lib/types';
import { extensionOf } from '../components/OfficeExtensions';
import { Avatar } from '../components/Avatar';
import { ContactLines, PresenceBadges, ScheduleReviewLine } from '../components/PersonDetails';
import { useTodaysScheduleReviews } from '../lib/schedule-reviews';
import { useConfirm } from '../components/ConfirmDialog';
import { ImportStaff } from '../components/ImportStaff';
import { JobRoleTag } from '../components/JobRoleTag';
import { rolesHeldBy } from '../components/JobRoleSelect';
import { ROLE_LABELS, StaffEditor } from '../components/StaffEditor';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeading,
  Spinner,
  buttonClass,
} from '../components/ui';

/**
 * Who works here, what they do and how they sign in. Admins add staff and give
 * them a way in; since October 2026 (Dominguez: "can we merge the Staff and Job
 * Roles? I should be able to search staff by job roles") the job roles live on
 * the same screen - a row of roles above the list narrows it to the people in
 * one, and the roles themselves are kept at the bottom. Managers, who keep the
 * job roles, now open this screen too: they see the cards and the job roles,
 * and none of the admin's tools (adding people, Profile, welcome emails,
 * sign-in details), which the server refuses them anyway; Edit opens the
 * editor for them as it always did (read, no photo, no save).
 */
export function StaffPage() {
  const { employee: me } = useSession();
  const isAdmin = me?.role === 'ADMIN';
  const location = useLocation();
  const [staff, setStaff] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  /// The Directory's view of each person - in now, working from home, "about
  /// you" - so a card here says everything a Directory card does.
  const [directory, setDirectory] = useState<Map<string, DirectoryEntry>>(new Map());
  const [extensions, setExtensions] = useState<OfficeExtension[]>([]);
  const reviews = useTodaysScheduleReviews();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  /// How many were just added, and for how many onboarding started by itself.
  const [imported, setImported] = useState<{ added: number; onboarding: number } | null>(null);
  const [welcoming, setWelcoming] = useState(false);
  const [welcomeReport, setWelcomeReport] = useState<{ sent: number; failed: string[] } | null>(
    null,
  );
  const confirm = useConfirm();
  // The right-click menu's "Open in Staff" arrives as ?q=name.
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('q') ?? '',
  );
  const [showTerminated, setShowTerminated] = useState(false);
  /// Only the people in this job role, or everybody.
  const [roleFilter, setRoleFilter] = useState<string>(
    () => new URLSearchParams(window.location.search).get('role') ?? '',
  );
  /// Whose details are open in the editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const editing = staff.find((person) => person.id === editingId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staffData, locationData, roleData, directoryData, extensionData] = await Promise.all([
        api.listEmployees(),
        api.listLocations(),
        api.jobRoles(),
        // Extra, not essential: without it the cards just say less.
        api.directory().catch(() => [] as DirectoryEntry[]),
        api.extensions().catch(() => [] as OfficeExtension[]),
      ]);
      setStaff(staffData);
      setDirectory(new Map(directoryData.map((entry) => [entry.id, entry])));
      setExtensions(extensionData);
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

  /// The job roles themselves - add, rename, colour, who is in each, the
  /// minimums - in a pop-up from the filter row (October 2026, Dominguez:
  /// "is the Job roles section actually needed since we are already grouping
  /// them at the top? ... can't that be integrated?"). /job-roles, the old
  /// address, lands here with #job-roles and opens it.
  const [rolesOpen, setRolesOpen] = useState(() => window.location.hash === '#job-roles');
  useEffect(() => {
    if (location.hash === '#job-roles') setRolesOpen(true);
  }, [location.hash]);

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
      body: 'Each gets a link to choose their password - good for a week - with how to put Domi Staff on their phone and answers to the usual first-day questions. People who already have a password or have already been sent one are left out.',
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

  const needle = search.trim().toLowerCase();
  const listed = staff.filter(
    (person) => showTerminated || person.employmentStatus !== 'TERMINATED',
  );
  const inRole = (person: Employee, roleId: string) =>
    jobRoles.some((role) => role.id === roleId && role.members.some((m) => m.id === person.id));
  // The words typed match a job role's name too ("front" finds Front Desk).
  const visible = listed.filter(
    (person) =>
      (roleFilter === '' || inRole(person, roleFilter)) &&
      (needle === '' ||
        [
          person.firstName,
          person.lastName,
          person.preferredName,
          person.email,
          ...rolesHeldBy(person.id, jobRoles).map((role) => role.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)),
  );
  const countIn = (roleId: string) => listed.filter((person) => inRole(person, roleId)).length;
  const filterRole = jobRoles.find((role) => role.id === roleFilter);

  return (
    <div className="max-w-6xl">
      <PageHeading
        title="Staff"
        subtitle={
          isAdmin
            ? 'Who works here, what they do, what they can see, and how they sign in.'
            : 'Who works here and what they do.'
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <input
        aria-label="Search staff"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name, email or job role"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {/* One press shows only the people in a job role; the count is of the
          people listed (former staff only when shown). */}
      {jobRoles.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Job role"
          data-testid="staff-role-filter"
        >
          <button
            type="button"
            aria-pressed={roleFilter === ''}
            onClick={() => setRoleFilter('')}
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${
              roleFilter === ''
                ? 'bg-slate-900 text-white ring-slate-900'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            Everyone ({listed.length})
          </button>
          {jobRoles.map((role) => {
            const on = roleFilter === role.id;
            return (
              <button
                key={role.id}
                type="button"
                aria-pressed={on}
                onClick={() => setRoleFilter(on ? '' : role.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${
                  on
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                <JobRoleDot colour={role.colour} />
                {role.name} ({countIn(role.id)})
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setRolesOpen(true)}
            className="rounded-full px-3 py-1 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
          >
            Job roles…
          </button>
        </div>
      )}
      {!loading && jobRoles.length === 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setRolesOpen(true)}
            className={buttonClass('secondary', 'sm')}
          >
            Job roles…
          </button>
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
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setImporting((open) => !open);
                setAdding(false);
              }}
              className={buttonClass('secondary', 'md')}
            >
              {importing ? 'Cancel' : 'Add several people'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding((open) => !open);
                setImporting(false);
              }}
              className={buttonClass('primary', 'md')}
            >
              {adding ? 'Cancel' : '+ Add someone'}
            </button>
          </div>
        )}
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
            <span data-testid="staff-added">
              {imported.added} {imported.added === 1 ? 'person' : 'people'} added.{' '}
              {imported.onboarding > 0 &&
                (imported.added === 1
                  ? 'Their onboarding checklist has started. '
                  : `Onboarding checklists started for ${imported.onboarding} new ${imported.onboarding === 1 ? 'hire' : 'hires'}. `)}
              Nobody has been emailed yet - send the welcome emails when you are ready.
            </span>
          </Alert>
        </div>
      )}

      {!loading && isAdmin && (
        <NotSignedInCard refreshKey={staff.length + (welcomeReport?.sent ?? 0)} />
      )}

      {isAdmin && waiting.length > 0 && !loading && (
        <Card
          className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4"
          testId="welcome-everyone"
        >
          <p className="text-sm text-slate-700">
            <strong>
              {waiting.length} {waiting.length === 1 ? 'person has' : 'people have'}
            </strong>{' '}
            not been sent a welcome email - the link to choose their password, with how to put Domi
            Staff on their phone.
          </p>
          <button
            type="button"
            disabled={welcoming}
            onClick={() => void welcomeEveryone()}
            className={buttonClass('primary', 'md')}
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
            onImported={(result) => {
              setImporting(false);
              setImported(result);
              void load();
            }}
          />
        </div>
      )}

      {adding && (
        <div className="mb-4">
          <AddStaffForm
            locations={locations}
            onCreated={(onboardingStarted) => {
              setAdding(false);
              setImported({ added: 1, onboarding: onboardingStarted ? 1 : 0 });
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
        <EmptyState>
          {needle
            ? `Nobody matches “${search.trim()}”${filterRole ? ` in ${filterRole.name}` : ''}.`
            : filterRole
              ? `Nobody is in ${filterRole.name}.`
              : 'Nobody here yet. Add your managers to get started.'}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((person) => (
            <StaffCard
              key={person.id}
              person={person}
              entry={directory.get(person.id)}
              extension={extensionOf(extensions, person.id)}
              review={reviews.get(person.id)}
              jobRoles={jobRoles}
              isMe={person.id === me?.id}
              canOpenProfile={isAdmin}
              canEdit={isAdmin}
              onEdit={() => {
                setLeft(null);
                setEditingId(person.id);
              }}
            />
          ))}
        </div>
      )}

      {rolesOpen && (
        <Modal
          title="Job roles"
          onClose={() => {
            setRolesOpen(false);
            if (location.hash === '#job-roles') window.history.replaceState(null, '', '/staff');
          }}
          wide
          testId="job-roles-dialog"
        >
          <JobRolesSection
            roles={jobRoles}
            staff={staff}
            onChanged={(updated) =>
              setJobRoles((current) =>
                current.map((role) => (role.id === updated.id ? updated : role)),
              )
            }
            onReload={() => void load()}
          />
        </Modal>
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
  entry,
  extension,
  review,
  jobRoles,
  isMe,
  canOpenProfile,
  canEdit,
  onEdit,
}: {
  person: Employee;
  /// The same person as the Directory has them; none for former staff.
  entry?: DirectoryEntry;
  /// Their line on the office extensions list, if any.
  extension: OfficeExtension | null;
  /// Who reviews their patient schedule today, for a provider.
  review?: ScheduleReview;
  /// Every job role, with its members - which of them this person is in.
  jobRoles: JobRole[];
  isMe: boolean;
  /// Admins only: the name opens their staff profile (address, pay, time off).
  canOpenProfile: boolean;
  /// Admins only: the sign-in and ADP details under the line. A manager's
  /// card is the Directory's, plus access and job roles, and Edit.
  canEdit: boolean;
  onEdit: () => void;
}) {
  // Their main job role first.
  const heldRoles = rolesHeldBy(person.id, jobRoles);
  const terminated = person.employmentStatus === 'TERMINATED';

  return (
    <Card testId={`staff-${person.email}`} className="flex flex-col p-4">
      <div className={`flex gap-3 ${terminated ? 'opacity-60' : ''}`}>
        <Avatar person={person} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">
              {canOpenProfile ? (
                <Link
                  to={`/staff/${person.id}`}
                  className="text-brand-700 underline-offset-2 hover:underline"
                >
                  {person.firstName} {person.lastName}
                </Link>
              ) : (
                <>
                  {person.firstName} {person.lastName}
                </>
              )}
              {person.preferredName && person.preferredName !== person.firstName && (
                <span className="ml-1 font-normal text-slate-500">(“{person.preferredName}”)</span>
              )}
              {person.pronouns && (
                <span className="ml-1 text-sm font-normal text-slate-500">({person.pronouns})</span>
              )}
              {isMe && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}
            </p>
            {entry && <PresenceBadges entry={entry} />}
          </div>
          {heldRoles.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1" data-testid="staff-job-roles">
              {heldRoles.map((jobRole, index) => (
                <JobRoleTag
                  key={jobRole.id}
                  name={jobRole.name}
                  colour={jobRole.colour}
                  main={heldRoles.length > 1 && index === 0}
                />
              ))}
            </p>
          )}
          {/* What kind of account it is sits with the offices (October 2026,
              Dominguez: on the bottom row it pushed Profile and Edit onto a
              line of their own). */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>
              {person.locations.map((l) => l.location.name).join(', ') || 'No location assigned'}
            </span>
            {person.isSharedAccount ? (
              <Badge tone="info">Shared account</Badge>
            ) : (
              person.clocksIn === false && <Badge tone="neutral">Doesn&rsquo;t clock in</Badge>
            )}
          </p>
          {entry?.about && <p className="mt-1 text-sm text-slate-700">{entry.about}</p>}
          <ScheduleReviewLine review={review} />
          <ContactLines
            person={person}
            extension={extension}
            fromHomeToday={Boolean(entry?.onNow?.remote || entry?.homeToday)}
          />
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3 sm:mt-auto">
        {canEdit && !terminated && (
          <p className="text-xs text-slate-500">
            {person.adpFileNumber ? `ADP File # ${person.adpFileNumber}` : 'No ADP File # yet'}
          </p>
        )}
        {canEdit && !terminated && person.hasPassword === false && (
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={person.role === 'EMPLOYEE' ? 'neutral' : 'info'}>
            {ROLE_LABELS[person.role]} access
          </Badge>
          {terminated && <Badge tone="danger">Former</Badge>}
          {canEdit && person.hasKioskPin && <Badge tone="success">PIN</Badge>}
          <span className="ml-auto flex gap-2">
            {canOpenProfile && (
              <Link
                to={`/staff/${person.id}`}
                aria-label={`Profile of ${person.firstName} ${person.lastName}`}
                className={buttonClass('secondary', 'sm')}
              >
                Profile
              </Link>
            )}
            {/* A manager's Edit opens the editor as it always did: it shows
                them the person (licenses included) and hides the photo and
                sign-in tools; the server refuses them a save. */}
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${person.firstName} ${person.lastName}`}
              className={buttonClass('secondary', 'sm')}
            >
              Edit
            </button>
          </span>
        </div>
      </div>
    </Card>
  );
}

function AddStaffForm({
  locations,
  onCreated,
}: {
  locations: Location[];
  onCreated: (onboardingStarted: boolean) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [payType, setPayType] = useState('HOURLY');
  const [hireDate, setHireDate] = useState(() => browserToday());
  const [assigned, setAssigned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const created = await api.createEmployee({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        role,
        payType,
        hireDate: hireDate || undefined,
        locationIds: assigned,
        primaryLocationId: assigned[0],
      });
      onCreated(Boolean(created.onboardingStarted));
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
