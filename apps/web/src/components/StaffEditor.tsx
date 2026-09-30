import { useEffect, useRef, useState } from 'react';
import { formatCalendarDate, localDate } from '../lib/format';
import { MONTHS } from '../lib/birthday';
import { ApiError, api } from '../lib/api';
import type { CredentialStanding, Employee, JobRole, Location, Role } from '../lib/types';
import { PASSWORD_RULE, meetsPasswordRule } from '../lib/password';
import { useConfirm } from './ConfirmDialog';
import { Alert, Badge, buttonClass } from './ui';
import { WeeklyScheduleEditor } from './WeeklyScheduleEditor';

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
};

const FIELD =
  'mt-1 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';
const OUTLINE_BUTTON =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/**
 * Everything about one person on the Staff screen, in one place: their
 * details, how they sign in, and — last, behind a second step and a
 * confirmation — marking them as having left.
 *
 * It used to be spread along each card, with "No longer employed" one tap
 * from "Edit details"; that was too easy to press by mistake. Nothing is lost
 * by it (timesheets stay, and they can be brought back from here), but it
 * signs somebody out and takes them off the rota on the spot.
 */
export function StaffEditor({
  person,
  locations,
  jobRoles,
  isMe,
  onClose,
  onChanged,
  onLeft,
}: {
  person: Employee;
  locations: Location[];
  /// Every job role, with its members — which of them this person is in.
  jobRoles: JobRole[];
  isMe: boolean;
  onClose: () => void;
  /// Something was saved; the list should be fetched again.
  onChanged: () => void;
  /// They were marked as having left. The editor closes.
  onLeft: () => void;
}) {
  const confirm = useConfirm();
  const heldRoles = jobRoles.filter((jobRole) =>
    jobRole.members.some((member) => member.id === person.id),
  );
  const initial = {
    firstName: person.firstName,
    lastName: person.lastName,
    preferredName: person.preferredName ?? '',
    postNominals: person.postNominals ?? '',
    email: person.email,
    phone: person.phone ?? '',
    role: person.role,
    payType: person.payType ?? 'HOURLY',
    jobRoleIds: heldRoles.map((jobRole) => jobRole.id),
    locationIds: person.locations.map((l) => l.locationId),
    hireDate: person.hireDate ? person.hireDate.slice(0, 10) : '',
    birthMonth: person.birthdayMonth ? String(person.birthdayMonth) : '',
    birthDay: person.birthdayDay ? String(person.birthdayDay) : '',
    adpFileNumber: person.adpFileNumber ?? '',
  };
  // Taken once, when the editor opens; a save closes it.
  const [start] = useState(initial);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /// Their usual week has its own Save; this is whether it has unsaved edits.
  const [weekDirty, setWeekDirty] = useState(false);
  const terminated = person.employmentStatus === 'TERMINATED';
  // Ticking a box off and on again is not a change.
  const comparable = (values: typeof form) =>
    JSON.stringify({
      ...values,
      jobRoleIds: [...values.jobRoleIds].sort(),
      locationIds: [...values.locationIds].sort(),
    });
  const dirty = comparable(form) !== comparable(start);
  const emailChanged = form.email.trim().toLowerCase() !== person.email;
  const phoneDigits = form.phone.replace(/\D/g, '').length;
  const phoneProblem =
    form.phone.trim() !== '' && (phoneDigits < 7 || form.phone.trim().length > 25)
      ? 'That does not look like a phone number.'
      : null;
  const birthdayHalf = (form.birthMonth === '') !== (form.birthDay === '');

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  async function close() {
    if (dirty || weekDirty) {
      const leave = await confirm({
        title: 'Close without saving?',
        body: dirty
          ? `The changes to ${person.firstName}’s details have not been saved.`
          : `The changes to ${person.firstName}’s usual week have not been saved.`,
        confirmLabel: 'Close without saving',
        cancelLabel: 'Keep editing',
      });
      if (!leave) return;
    }
    onClose();
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: 'jobRoleIds' | 'locationIds', id: string) {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((existing) => existing !== id)
        : [...current[key], id],
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.updateEmployee(person.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        preferredName: form.preferredName.trim() || null,
        postNominals: form.postNominals.trim() || null,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        role: form.role,
        payType: form.payType,
        locationIds: form.locationIds,
        primaryLocationId: form.locationIds[0],
        adpFileNumber: form.adpFileNumber.trim() || null,
        hireDate: form.hireDate || null,
        birthdayMonth: form.birthMonth && form.birthDay ? Number(form.birthMonth) : null,
        birthdayDay: form.birthMonth && form.birthDay ? Number(form.birthDay) : null,
      });
      // Job roles live on the roles themselves; add and take off the difference.
      const held = new Set(start.jobRoleIds);
      for (const id of form.jobRoleIds.filter((id) => !held.has(id))) {
        await api.addJobRoleMember(id, person.id);
      }
      for (const id of [...held].filter((id) => !form.jobRoleIds.includes(id))) {
        await api.removeJobRoleMember(id, person.id);
      }
      onChanged();
      onClose();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save that change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40"
      onMouseDown={(event) => event.target === event.currentTarget && void close()}
    >
      <div
        className="flex min-h-full items-start justify-center p-2 sm:p-6"
        onMouseDown={(event) => event.target === event.currentTarget && void close()}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-editor-title"
          data-testid="staff-editor"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              void close();
            }
          }}
          className="w-full max-w-2xl rounded-xl bg-white shadow-xl outline-none"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
            <div className="min-w-0">
              <h2 id="staff-editor-title" className="text-lg font-semibold text-slate-900">
                {person.firstName} {person.lastName}
                {isMe && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
              </h2>
              <p className="mt-1 flex flex-wrap gap-2">
                <Badge tone={person.role === 'EMPLOYEE' ? 'neutral' : 'info'}>
                  {ROLE_LABELS[person.role]} access
                </Badge>
                {terminated && <Badge tone="danger">Former</Badge>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void close()}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              ×
            </button>
          </div>

          <form onSubmit={(event) => void save(event)} className="space-y-5 p-5">
            <Section title="Their details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="edit-first" label="First name">
                  <input
                    id="edit-first"
                    required
                    maxLength={80}
                    value={form.firstName}
                    onChange={(event) => set('firstName', event.target.value)}
                    className={FIELD}
                  />
                </Field>
                <Field id="edit-last" label="Last name">
                  <input
                    id="edit-last"
                    required
                    maxLength={80}
                    value={form.lastName}
                    onChange={(event) => set('lastName', event.target.value)}
                    className={FIELD}
                  />
                </Field>
                <Field
                  id="edit-preferred"
                  label="Name they go by"
                  hint="Optional. Shown to colleagues instead of their first name."
                >
                  <input
                    id="edit-preferred"
                    maxLength={80}
                    value={form.preferredName}
                    onChange={(event) => set('preferredName', event.target.value)}
                    className={FIELD}
                  />
                </Field>
                <Field
                  id="edit-post-nominals"
                  label="Letters after their name"
                  hint="Optional — MD, DO, APN-C, PA-C. Printed beside their name on the clinical forms."
                >
                  <input
                    id="edit-post-nominals"
                    maxLength={40}
                    placeholder="MD"
                    value={form.postNominals}
                    onChange={(event) => set('postNominals', event.target.value)}
                    className={FIELD}
                  />
                </Field>
                <Field
                  id="edit-phone"
                  label="Phone number"
                  hint="Colleagues see it in the Directory."
                  problem={phoneProblem}
                >
                  <input
                    id="edit-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    maxLength={25}
                    placeholder="(201) 555-0142"
                    value={form.phone}
                    onChange={(event) => set('phone', event.target.value)}
                    className={FIELD}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    id="edit-email"
                    label="Email"
                    hint="This is how they sign in, and where their emails go."
                  >
                    <input
                      id="edit-email"
                      type="email"
                      required
                      autoComplete="off"
                      value={form.email}
                      onChange={(event) => set('email', event.target.value)}
                      className={FIELD}
                    />
                  </Field>
                  {emailChanged && person.hasPassword && (
                    <p className="mt-1 text-xs text-amber-800">
                      From now on they sign in with the new address, not the old one — let them
                      know. Their password stays the same.
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Their photo, pronouns and &ldquo;about you&rdquo; line are theirs to set, on Your
                profile.
              </p>
            </Section>

            <Section title="At the practice">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id="edit-role"
                  label="Access"
                  hint="What they can do in the app. Manager: schedules, time off and hours. Admin: also staff and settings."
                >
                  <select
                    id="edit-role"
                    value={form.role}
                    onChange={(event) => set('role', event.target.value as Role)}
                    className={FIELD}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="edit-pay"
                  label="Pay type"
                  hint="Overtime warnings are for hourly staff only."
                >
                  <select
                    id="edit-pay"
                    value={form.payType}
                    onChange={(event) => set('payType', event.target.value as 'HOURLY' | 'SALARY')}
                    className={FIELD}
                  >
                    <option value="HOURLY">Hourly</option>
                    <option value="SALARY">Salary</option>
                  </select>
                </Field>
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-slate-700">Job roles</legend>
                <p className="text-xs text-slate-500">
                  What they do at the practice — tick all that apply. Decides their resources and
                  closing checklist, not what they can do in the app.
                </p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {jobRoles.map((jobRole) => (
                    <label key={jobRole.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.jobRoleIds.includes(jobRole.id)}
                        onChange={() => toggle('jobRoleIds', jobRole.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                      />
                      {jobRole.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-slate-700">Locations</legend>
                <p className="text-xs text-slate-500">
                  They can only clock in where they are assigned.
                </p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {locations.map((location) => (
                    <label key={location.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.locationIds.includes(location.id)}
                        onChange={() => toggle('locationIds', location.id)}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                      />
                      {location.name}
                    </label>
                  ))}
                </div>
                {form.locationIds.length === 0 && !terminated && (
                  <p className="mt-1 text-xs text-amber-700">
                    Assign at least one, or they will not be able to clock in anywhere.
                  </p>
                )}
              </fieldset>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field
                  id="edit-hired"
                  label="Hire date"
                  hint="Optional — used for first-year time off. Without it they get the whole year’s."
                >
                  <input
                    id="edit-hired"
                    type="date"
                    value={form.hireDate}
                    onChange={(event) => set('hireDate', event.target.value)}
                    className={FIELD}
                  />
                </Field>
                <fieldset>
                  <legend className="block text-sm font-medium text-slate-700">Birthday</legend>
                  <div className="flex gap-2">
                    <select
                      aria-label="Birthday month"
                      value={form.birthMonth}
                      onChange={(event) => set('birthMonth', event.target.value)}
                      className={FIELD}
                    >
                      <option value="">Not set</option>
                      {MONTHS.map((name, index) => (
                        <option key={name} value={index + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Birthday day"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={31}
                      value={form.birthDay}
                      onChange={(event) => set('birthDay', event.target.value)}
                      className={`${FIELD} !w-20`}
                    />
                  </div>
                  <p
                    className={`mt-1 text-xs ${birthdayHalf ? 'text-amber-700' : 'text-slate-500'}`}
                  >
                    {birthdayHalf
                      ? 'Give both the month and the day, or neither.'
                      : 'Month and day only — colleagues see it that week.'}
                  </p>
                </fieldset>
                <Field
                  id="edit-adp"
                  label="ADP File #"
                  hint="Their number in ADP TotalSource. Their hours cannot go in the ADP import file without it."
                >
                  <input
                    id="edit-adp"
                    value={form.adpFileNumber}
                    onChange={(event) => set('adpFileNumber', event.target.value)}
                    maxLength={10}
                    autoComplete="off"
                    className={`${FIELD} sm:max-w-[10rem]`}
                  />
                </Field>
              </div>
            </Section>

            {problem && <Alert>{problem}</Alert>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={
                  busy ||
                  !dirty ||
                  !form.firstName.trim() ||
                  !form.lastName.trim() ||
                  !form.email.trim() ||
                  phoneProblem !== null ||
                  birthdayHalf
                }
                className={buttonClass('primary', 'md')}
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => void close()}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </form>

          {!terminated && (
            <div className="border-t border-slate-100 p-5">
              <Section title="Usual week">
                <p className="mb-3 text-sm text-slate-600">
                  The days and hours they normally work, set once. They go on the rota as regular
                  shifts, kept eight weeks ahead.
                </p>
                <WeeklyScheduleEditor
                  person={person}
                  locations={locations}
                  jobRoles={jobRoles}
                  onDirtyChange={setWeekDirty}
                />
              </Section>
            </div>
          )}

          {!terminated && <LicensesSummary person={person} />}

          {!terminated && (
            <div className="border-t border-slate-100 p-5">
              <SigningIn person={person} onChanged={onChanged} />
            </div>
          )}

          <div className="border-t border-slate-100 p-5">
            {terminated ? (
              <BringBack person={person} onChanged={onChanged} />
            ) : isMe ? (
              <Section title="Leaving the practice">
                <p className="text-sm text-slate-600">
                  You cannot mark yourself as having left — it would lock you out. Another admin
                  can.
                </p>
              </Section>
            ) : (
              <Leaving person={person} onLeft={onLeft} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The licenses their job roles ask for, and what is on file — read-only here;
 * they are recorded and renewed on the Licenses screen. Shown only when a job
 * role of theirs asks for something.
 */
function LicensesSummary({ person }: { person: Employee }) {
  const [standing, setStanding] = useState<CredentialStanding | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .credentialStanding(person.id)
      .then((rows) => !cancelled && setStanding(rows[0] ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  if (!standing || standing.lines.length === 0) return null;
  const words: Record<CredentialStanding['lines'][number]['state'], string> = {
    CURRENT: 'current',
    DUE_SOON: 'due soon',
    EXPIRED: 'lapsed',
    MISSING: 'not on file',
  };
  return (
    <div className="border-t border-slate-100 p-5">
      <Section title="Licenses">
        <ul className="space-y-1 text-sm" data-testid="staff-licenses">
          {standing.lines.map((line) => {
            const bad = line.state === 'EXPIRED' || (line.required && line.state === 'MISSING');
            return (
              <li key={line.type.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-slate-800">
                  {line.type.name}{' '}
                  <span className="text-xs text-slate-500">
                    {line.required ? 'required' : 'optional'}
                  </span>
                </span>
                <span className={bad ? 'font-medium text-rose-700' : 'text-slate-600'}>
                  {words[line.state]}
                  {line.credential ? ` · ${formatCalendarDate(line.credential.expiresOn)}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Recorded and renewed under Manage → Licenses.</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  problem,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  problem?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {problem ? (
        <p className="mt-1 text-xs text-rose-700">{problem}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/// The manager's tools for getting somebody in: the welcome email, a temporary
/// password, and a tablet PIN. None of them is shown back afterwards except
/// the temporary password, once.
function SigningIn({ person, onChanged }: { person: Employee; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<'password' | 'pin' | null>(null);
  const [temporary, setTemporary] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinSet, setPinSet] = useState(false);
  const [welcomedAt, setWelcomedAt] = useState(person.welcomeSentAt ?? null);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const sendWelcome = () =>
    run(async () => {
      const result = await api.sendWelcome(person.id);
      setWelcomedAt(result.welcomeSentAt);
      onChanged();
    }, 'Could not send it.');

  const issuePassword = () =>
    run(async () => {
      await api.setTemporaryPassword(person.id, temporary);
      setIssued(temporary);
      setTemporary('');
      setOpen(null);
    }, 'Could not set that password.');

  const savePin = () =>
    run(async () => {
      await api.setKioskPin(person.id, pin);
      setPin('');
      setPinSet(true);
      setOpen(null);
      onChanged();
    }, 'Could not set that PIN.');

  return (
    <Section title="Signing in">
      <p className="text-sm text-slate-700" data-testid="welcome-status">
        {person.hasPassword === false ? (
          <>
            Has not chosen a password yet
            {welcomedAt
              ? ` · welcome email sent ${shortDate(welcomedAt)}`
              : ' · not sent a welcome email'}
          </>
        ) : (
          <>
            Has a password
            {person.lastLoginAt ? ` · last signed in ${shortDate(person.lastLoginAt)}` : ''}
          </>
        )}
      </p>
      <p className="text-sm text-slate-700">
        {person.hasKioskPin || pinSet ? 'Has a tablet PIN' : 'No tablet PIN yet'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {person.hasPassword === false && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendWelcome()}
            className={buttonClass('primary', 'md')}
          >
            {welcomedAt ? 'Send the welcome email again' : 'Send welcome email'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((current) => (current === 'password' ? null : 'password'))}
          className={OUTLINE_BUTTON}
        >
          {open === 'password' ? 'Cancel' : 'Set a temporary password'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => (current === 'pin' ? null : 'pin'))}
          className={OUTLINE_BUTTON}
        >
          {open === 'pin' ? 'Cancel' : 'Set a tablet PIN'}
        </button>
      </div>

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

      {pinSet && open !== 'pin' && (
        <div className="mt-3">
          <Alert tone="success">
            New PIN set. Tell {person.preferredName ?? person.firstName} in person; they can change
            it on their profile.
          </Alert>
        </div>
      )}

      {open === 'password' && (
        <div className="mt-3">
          <label htmlFor={`temp-${person.id}`} className="block text-sm font-medium text-slate-700">
            Temporary password
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id={`temp-${person.id}`}
              type="text"
              autoFocus
              autoComplete="off"
              value={temporary}
              onChange={(event) => setTemporary(event.target.value)}
              className="w-full max-w-xs rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
            <button
              type="button"
              onClick={() => setTemporary(suggestPassword())}
              className={OUTLINE_BUTTON}
            >
              Suggest one
            </button>
            <button
              type="button"
              disabled={busy || !meetsPasswordRule(temporary)}
              onClick={() => void issuePassword()}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Set it'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {PASSWORD_RULE} Signs them out everywhere and forces a change at next sign-in.
          </p>
        </div>
      )}

      {open === 'pin' && (
        <div className="mt-3">
          <label htmlFor={`pin-${person.id}`} className="block text-sm font-medium text-slate-700">
            New tablet PIN
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id={`pin-${person.id}`}
              type="password"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              className="w-32 rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
            />
            <button
              type="button"
              disabled={busy || pin.length < 4}
              onClick={() => void savePin()}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Set PIN'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            4 to 8 digits, for the front-desk time clock. Replaces any PIN they had; nobody can see
            it afterwards, you included.
          </p>
        </div>
      )}

      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}
    </Section>
  );
}

/// Marking somebody as having left. Deliberately two steps and a confirmation
/// away: it signs them out and takes them off the rota at once.
function Leaving({ person, onLeft }: { person: Employee; onLeft: () => void }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [lastDay, setLastDay] = useState(() => localDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function markAsLeft() {
    const day = new Date(`${lastDay}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const sure = await confirm({
      title: `Mark ${person.firstName} ${person.lastName} as no longer employed?`,
      body: (
        <>
          <p>Last day: {day}.</p>
          <p className="mt-2">
            Their sign-in and tablet PIN stop working straight away and they come off the rota and
            the Directory. Their timesheets are kept, and they can be brought back from{' '}
            <strong>Show former staff</strong> if this was a mistake.
          </p>
        </>
      ),
      confirmLabel: 'Yes, no longer employed',
      cancelLabel: 'Keep them',
    });
    if (!sure) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.terminateEmployee(person.id, lastDay);
      onLeft();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not do that.');
      setBusy(false);
    }
  }

  return (
    <Section title="Leaving the practice">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Only when {person.firstName} has left Domi Healthcare.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            {person.firstName} has left…
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
          <label htmlFor="last-day" className="block text-sm font-medium text-slate-700">
            Last day worked
          </label>
          <input
            id="last-day"
            type="date"
            required
            value={lastDay}
            onChange={(event) => setLastDay(event.target.value)}
            className="mt-1 rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600"
          />
          <p className="mt-1 text-xs text-slate-600">
            Their offboarding checklist counts from this day.
          </p>
          {problem && (
            <div className="mt-3">
              <Alert>{problem}</Alert>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !lastDay}
              onClick={() => void markAsLeft()}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Mark as no longer employed'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

/// Undoing "no longer employed" — after a mistake, or when somebody returns.
function BringBack({ person, onChanged }: { person: Employee; onChanged: () => void }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function bringBack() {
    const sure = await confirm({
      title: `Bring ${person.firstName} ${person.lastName} back?`,
      body: 'They can sign in again with the password and PIN they had, and they are back on the rota, the Directory and the time clock.',
      confirmLabel: 'Yes, bring them back',
      cancelLabel: 'Not now',
      tone: 'neutral',
    });
    if (!sure) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.updateEmployee(person.id, { employmentStatus: 'ACTIVE' });
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Former staff">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Marked as no longer employed
          {person.terminationDate
            ? ` — last day ${new Date(person.terminationDate).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })}`
            : ''}
          .
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void bringBack()}
          className={OUTLINE_BUTTON}
        >
          {busy ? 'Saving…' : 'Bring them back'}
        </button>
      </div>
      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}
    </Section>
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
