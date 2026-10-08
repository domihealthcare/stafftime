import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { NeedsAttention } from '../components/NeedsAttention';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeading,
  Spinner,
  buttonClass,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { OnePersonNote, useOnePerson } from '../components/OnePerson';
import { formatCalendarDate } from '../lib/format';
import { useIsAdmin, useIsManager } from '../lib/session';
import type {
  Credential,
  CredentialKind,
  CredentialStanding,
  CredentialType,
  Employee,
  JobRole,
} from '../lib/types';

const KINDS: { value: CredentialKind; label: string }[] = [
  { value: 'LICENSE', label: 'Professional license' },
  { value: 'CERTIFICATION', label: 'Certification' },
  { value: 'LIFE_SUPPORT', label: 'CPR / BLS / ACLS' },
  { value: 'REGISTRATION', label: 'Registration (DEA, NPI…)' },
  { value: 'IMMUNIZATION', label: 'Immunization' },
  { value: 'BACKGROUND_CHECK', label: 'Background check' },
  { value: 'OTHER', label: 'Something else' },
];

const KIND_LABEL = Object.fromEntries(KINDS.map((kind) => [kind.value, kind.label]));

type Horizon = '30' | '60' | '180' | 'all';

/// What a manager is looking at: what lapses next, each person against what
/// their job roles ask for, or the list of license types itself.
type View = 'due' | 'people' | 'types';

/// Who and what the Record form starts on, from a "Record it" on a missing line.
interface Prefill {
  employeeId: string;
  credentialTypeId: string;
}

/**
 * Licenses, certifications and anything else that has to be renewed.
 *
 * The compliance risk this screen exists for is a quiet one: nobody notices a
 * lapsed license until somebody asks to see it. So the default view is what is
 * about to lapse, soonest first, rather than everything the practice holds.
 */
export function CredentialsPage() {
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [standing, setStanding] = useState<CredentialStanding[]>([]);
  const [types, setTypes] = useState<CredentialType[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  /// One person, from a staff profile's shortcut (`?person=`): By person, theirs only.
  const { personId, showEveryone } = useOnePerson();
  const [view, setView] = useState<View>(personId ? 'people' : 'due');
  const [horizon, setHorizon] = useState<Horizon>('60');
  const [adding, setAdding] = useState<Prefill | 'blank' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, people, lines, kinds, roles] = await Promise.all([
        api.listCredentials(horizon === 'all' ? {} : { withinDays: horizon }),
        isManager ? api.listEmployees() : Promise.resolve([]),
        api.credentialStanding(),
        api.credentialTypes(),
        isManager ? api.jobRoles() : Promise.resolve([]),
      ]);
      setCredentials(rows);
      setStaff(people);
      setStanding(lines);
      setTypes(kinds);
      setJobRoles(roles);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load credentials.');
    } finally {
      setLoading(false);
    }
  }, [horizon, isManager]);

  function record(prefill: Prefill) {
    setAdding(prefill);
    setView('due');
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    void load();
  }, [load]);

  const expired = useMemo(() => credentials.filter((row) => row.expired), [credentials]);
  const upcoming = useMemo(() => credentials.filter((row) => !row.expired), [credentials]);

  if (loading) return <Spinner label="Loading credentials" />;

  return (
    <div>
      <PageHeading
        title={isManager ? 'Licenses and Certifications' : 'Your Licenses and Certifications'}
        subtitle={
          isManager
            ? 'What has to be renewed, and when. Nobody notices a lapsed license until somebody asks to see it.'
            : 'What the practice holds for you, and when it runs out.'
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <NeedsAttention sections={['missingCredentials']} />

      {/* Staff: their own list, against what their job roles ask for. */}
      {!isManager && standing[0] && standing[0].lines.length > 0 && (
        <div className="mb-6">
          <StandingCard person={standing[0]} title="What your job role asks for" />
        </div>
      )}

      {isManager && (
        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
          {(
            [
              ['due', 'What lapses next'],
              ['people', 'By person'],
              ['types', 'License types'],
            ] as [View, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                view === value
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isManager && view === 'people' && (
        <div className="space-y-3">
          {personId && (
            <OnePersonNote
              name={(() => {
                const found = standing.find((person) => person.employee.id === personId);
                return found
                  ? `${found.employee.preferredName ?? found.employee.firstName} ${found.employee.lastName}`
                  : 'one person';
              })()}
              onClear={showEveryone}
            />
          )}
          {standing.length === 0 ? (
            <EmptyState>
              No job role asks for a license yet. Say which do under License types.
            </EmptyState>
          ) : (
            standing
              .filter((person) => !personId || person.employee.id === personId)
              .map((person) => (
                <StandingCard
                  key={person.employee.id}
                  person={person}
                  onRecord={(credentialTypeId) =>
                    record({ employeeId: person.employee.id, credentialTypeId })
                  }
                />
              ))
          )}
        </div>
      )}

      {isManager && view === 'types' && (
        <CredentialTypesPanel
          types={types}
          jobRoles={jobRoles}
          onChanged={() => void load()}
          onError={setError}
        />
      )}

      {(!isManager || view === 'due') && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['30', 'Next 30 days'],
                  ['60', 'Next 60 days'],
                  ['180', 'Next 6 months'],
                  ['all', 'Everything'],
                ] as [Horizon, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHorizon(value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    horizon === value
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {isManager && !adding && (
              <button
                type="button"
                onClick={() => setAdding('blank')}
                className={buttonClass('primary', 'md')}
              >
                + Record one
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-4">
              <CredentialForm
                key={
                  adding === 'blank' ? 'blank' : `${adding.employeeId}-${adding.credentialTypeId}`
                }
                staff={staff}
                types={types}
                prefill={adding === 'blank' ? null : adding}
                onSaved={() => {
                  setAdding(null);
                  void load();
                }}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}

          {expired.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-rose-700">
                Already lapsed
              </h2>
              <div className="space-y-2">
                {expired.map((row) => (
                  <CredentialCard
                    key={row.id}
                    credential={row}
                    canEdit={isManager}
                    canDelete={isAdmin}
                    onChanged={() => void load()}
                    onError={setError}
                  />
                ))}
              </div>
            </div>
          )}

          {upcoming.length > 0 ? (
            <div>
              {expired.length > 0 && (
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Coming up
                </h2>
              )}
              <div className="space-y-2">
                {upcoming.map((row) => (
                  <CredentialCard
                    key={row.id}
                    credential={row}
                    canEdit={isManager}
                    canDelete={isAdmin}
                    onChanged={() => void load()}
                    onError={setError}
                  />
                ))}
              </div>
            </div>
          ) : (
            expired.length === 0 && (
              <EmptyState>
                {horizon === 'all'
                  ? 'Nothing recorded yet.'
                  : 'Nothing lapses in that window. Try a longer one.'}
              </EmptyState>
            )
          )}
        </>
      )}
    </div>
  );
}

const STATE_BADGE: Record<
  CredentialStanding['lines'][number]['state'],
  { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }
> = {
  CURRENT: { tone: 'success', label: 'current' },
  DUE_SOON: { tone: 'warning', label: 'due soon' },
  EXPIRED: { tone: 'danger', label: 'lapsed' },
  MISSING: { tone: 'danger', label: 'not on file' },
};

/**
 * One person against what their job roles ask for — required first. A
 * missing optional one is shown plainly, never in red: it is worth having,
 * not chased.
 */
function StandingCard({
  person,
  title,
  onRecord,
}: {
  person: CredentialStanding;
  title?: string;
  onRecord?: (credentialTypeId: string) => void;
}) {
  const name = `${person.employee.preferredName ?? person.employee.firstName} ${person.employee.lastName}`;
  const missing = person.lines.filter((line) => line.required && line.state === 'MISSING').length;
  return (
    <Card className="p-4" testId={`standing-${name}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{title ?? name}</h2>
        {missing > 0 && (
          <span className="text-xs font-medium text-rose-700">
            {missing} required {missing === 1 ? 'one' : 'ones'} not on file
          </span>
        )}
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {person.lines.map((line) => {
          const badge =
            line.state === 'MISSING' && !line.required
              ? { tone: 'neutral' as const, label: 'not on file' }
              : STATE_BADGE[line.state];
          return (
            <li
              key={line.type.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium text-slate-800">{line.type.name}</span>{' '}
                <span className="text-xs text-slate-500">
                  {line.required ? 'Required' : 'Optional'} for {line.forRoles.join(', ')}
                </span>
                {line.credential && (
                  <p className="text-xs text-slate-500">
                    {line.state === 'EXPIRED' ? 'Lapsed' : 'Expires'}{' '}
                    {formatCalendarDate(line.credential.expiresOn)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                {onRecord && (line.state === 'MISSING' || line.state === 'EXPIRED') && (
                  <button
                    type="button"
                    onClick={() => onRecord(line.type.id)}
                    aria-label={`Record ${line.type.name} for ${name}`}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Record it
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * The practice's list of license types, and which job roles need each one
 * (Dominguez, September 2026). Managers add one, say how often it is renewed
 * and who needs it — required or optional — and change it as things change.
 */
function CredentialTypesPanel({
  types,
  jobRoles,
  onChanged,
  onError,
}: {
  types: CredentialType[];
  jobRoles: JobRole[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<CredentialType | 'new' | null>(null);
  const confirm = useConfirm();

  async function remove(type: CredentialType) {
    const sure = await confirm({
      title: `Stop asking for ${type.name}?`,
      body: 'Nobody will be expected to have it any more. Anything already recorded stays, and still counts down to its expiry.',
      confirmLabel: 'Stop asking for it',
      cancelLabel: 'Keep it',
    });
    if (!sure) return;
    try {
      await api.removeCredentialType(type.id);
      onChanged();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'Could not remove that.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          What the practice asks for, and from which job roles. Required ones missing from
          somebody&rsquo;s file are chased; optional ones are only listed.
        </p>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={buttonClass('primary', 'md')}
          >
            + New license type
          </button>
        )}
      </div>

      {editing === 'new' && (
        <CredentialTypeEditor
          type={null}
          jobRoles={jobRoles}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {types.length === 0 && editing === null && <EmptyState>No license types yet.</EmptyState>}

      {types.map((type) =>
        editing !== 'new' && editing?.id === type.id ? (
          <CredentialTypeEditor
            key={type.id}
            type={type}
            jobRoles={jobRoles}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Card key={type.id} className="p-3" testId={`credential-type-${type.name}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{type.name}</span>
                  <Badge>{KIND_LABEL[type.kind] ?? type.kind}</Badge>
                  <span className="text-xs text-slate-500">
                    {type.renewalMonths
                      ? `Renewed every ${type.renewalMonths} months`
                      : 'Renewal varies'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {type.requirements.length === 0
                    ? 'No job role asks for it yet.'
                    : type.requirements
                        .map(
                          (requirement) =>
                            `${requirement.jobRole.name}: ${requirement.required ? 'required' : 'optional'}`,
                        )
                        .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(type)}
                  className={buttonClass('secondary', 'sm')}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(type)}
                  className="text-xs font-medium text-slate-500 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            </div>
          </Card>
        ),
      )}
    </div>
  );
}

type Need = 'none' | 'optional' | 'required';

function CredentialTypeEditor({
  type,
  jobRoles,
  onSaved,
  onCancel,
}: {
  type: CredentialType | null;
  jobRoles: JobRole[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(type?.name ?? '');
  const [kind, setKind] = useState<CredentialKind>(type?.kind ?? 'LICENSE');
  const [renewal, setRenewal] = useState(type?.renewalMonths ? String(type.renewalMonths) : '');
  const [needs, setNeeds] = useState<Record<string, Need>>(() =>
    Object.fromEntries(
      (type?.requirements ?? []).map((requirement) => [
        requirement.jobRoleId,
        requirement.required ? 'required' : 'optional',
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = renewal.trim() === '' ? null : Number(renewal);
  const monthsValid = months === null || (Number.isInteger(months) && months >= 1 && months <= 120);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.saveCredentialType(type?.id ?? null, {
        name: name.trim(),
        kind,
        renewalMonths: months,
        requirements: Object.entries(needs)
          .filter(([, need]) => need !== 'none')
          .map(([jobRoleId, need]) => ({ jobRoleId, required: need === 'required' })),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        {type ? `Edit ${type.name}` : 'New license type'}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Name</span>
          <input
            aria-label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Flu vaccine"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Kind</span>
          <select
            aria-label="Kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as CredentialKind)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Renewed every <span className="font-normal text-slate-500">(months, optional)</span>
          </span>
          <input
            aria-label="Renewed every (months)"
            type="number"
            min={1}
            max={120}
            value={renewal}
            onChange={(event) => setRenewal(event.target.value)}
            placeholder="e.g. 12"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
        <p className="self-end text-xs text-slate-500 sm:col-span-2">
          With it, recording one only needs the date it was done — the expiry is worked out. Leave
          it empty when it varies.
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">Who needs it</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {jobRoles.map((role) => (
            <label key={role.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-800">{role.name}</span>
              <select
                aria-label={`${role.name} needs it`}
                value={needs[role.id] ?? 'none'}
                onChange={(event) =>
                  setNeeds((current) => ({ ...current, [role.id]: event.target.value as Need }))
                }
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="none">Not needed</option>
                <option value="optional">Optional</option>
                <option value="required">Required</option>
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {!monthsValid && (
        <p className="mt-2 text-xs text-rose-600">Months is a whole number from 1 to 120.</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || name.trim().length < 2 || !monthsValid}
          onClick={() => void save()}
          className={buttonClass('primary', 'md')}
        >
          {busy ? 'Saving…' : 'Save license type'}
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

function CredentialCard({
  credential,
  canEdit,
  canDelete,
  onChanged,
  onError,
}: {
  credential: Credential;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [renewing, setRenewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const name =
    credential.employee.preferredName ??
    `${credential.employee.firstName} ${credential.employee.lastName}`;

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{name}</span>
            <span className="text-sm text-slate-700">{credential.name}</span>
            <Badge>{KIND_LABEL[credential.kind] ?? credential.kind}</Badge>
            <ExpiryBadge credential={credential} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Expires {formatCalendarDate(credential.expiresOn)}
            {credential.issuer && ` · ${credential.issuer}`}
          </p>
          {credential.notes && <p className="mt-0.5 text-xs text-slate-600">{credential.notes}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {canEdit && (
            <button
              type="button"
              onClick={() => setRenewing((open) => !open)}
              className={buttonClass('secondary', 'sm')}
            >
              {renewing ? 'Cancel' : 'Renew'}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const sure = await confirm({
                  title: `Delete ${name}’s ${credential.name}?`,
                  body: 'Its expiry date will no longer be tracked or chased.',
                  confirmLabel: 'Delete it',
                  cancelLabel: 'Keep it',
                });
                if (!sure) return;
                setBusy(true);
                try {
                  await api.deleteCredential(credential.id);
                  onChanged();
                } catch (cause) {
                  onError(cause instanceof ApiError ? cause.message : 'Could not delete that.');
                } finally {
                  setBusy(false);
                }
              }}
              className="text-xs font-medium text-slate-500 hover:text-rose-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {renewing && (
        <RenewalForm
          credential={credential}
          onSaved={() => {
            setRenewing(false);
            onChanged();
          }}
          onError={onError}
        />
      )}
    </Card>
  );
}

function ExpiryBadge({ credential }: { credential: Credential }) {
  if (credential.expired) {
    const days = Math.abs(credential.daysUntilExpiry);
    return <Badge tone="danger">lapsed {days === 1 ? 'yesterday' : `${days} days ago`}</Badge>;
  }
  if (credential.daysUntilExpiry === 0) return <Badge tone="danger">expires today</Badge>;
  if (credential.daysUntilExpiry <= 30) {
    return <Badge tone="warning">{credential.daysUntilExpiry} days left</Badge>;
  }
  return <Badge tone="success">current</Badge>;
}

/// Renewing is the common act: the same credential, a new date. It is a small
/// form rather than a trip through the full editor.
function RenewalForm({
  credential,
  onSaved,
  onError,
}: {
  credential: Credential;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [expiresOn, setExpiresOn] = useState(credential.expiresOn.slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateCredential(credential.id, { expiresOn });
      onSaved();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">New expiry date</span>
        <input
          aria-label="New expiry date"
          type="date"
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className={buttonClass('primary', 'md')}
      >
        {busy ? 'Saving…' : 'Save the renewal'}
      </button>
    </div>
  );
}

/// The Which list's value for something that is not one of the types.
const SOMETHING_ELSE = 'other';

function CredentialForm({
  staff,
  types,
  prefill,
  onSaved,
  onCancel,
}: {
  staff: Employee[];
  types: CredentialType[];
  prefill: Prefill | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(prefill?.employeeId ?? '');
  const [typeId, setTypeId] = useState(
    prefill?.credentialTypeId ?? (types.length > 0 ? '' : SOMETHING_ELSE),
  );
  const [kind, setKind] = useState<CredentialKind>('LICENSE');
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = types.find((candidate) => candidate.id === typeId) ?? null;
  const freeHand = typeId === SOMETHING_ELSE;
  /// With a renewal interval, the date it was done is enough.
  const worksOutExpiry = Boolean(type?.renewalMonths) && issuedOn !== '' && expiresOn === '';
  const ready =
    employeeId !== '' &&
    (type !== null || (freeHand && name.trim() !== '')) &&
    (expiresOn !== '' || worksOutExpiry);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createCredential({
        employeeId,
        ...(type ? { credentialTypeId: type.id } : { kind, name: name.trim() }),
        issuer: issuer.trim() || undefined,
        issuedOn: issuedOn || undefined,
        expiresOn: expiresOn || undefined,
      });
      onSaved();
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
          <span className="mb-1 block font-medium text-slate-700">Who</span>
          <select
            aria-label="Who"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">Choose someone…</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Which</span>
          <select
            aria-label="Which"
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            {types.length > 0 && <option value="">Choose one…</option>}
            {types.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            <option value={SOMETHING_ELSE}>Something else…</option>
          </select>
        </label>

        {freeHand && (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">What it is</span>
              <input
                aria-label="What it is"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="NJ Registered Nurse license"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Kind</span>
              <select
                aria-label="Kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as CredentialKind)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              >
                {KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Done on <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            aria-label="Done on"
            type="date"
            value={issuedOn}
            onChange={(event) => setIssuedOn(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Expires</span>
          <input
            aria-label="Expires"
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
          {type?.renewalMonths && (
            <span className="mt-1 block text-xs text-slate-500">
              {worksOutExpiry
                ? `Worked out: ${type.renewalMonths} months after the date it was done.`
                : `Renewed every ${type.renewalMonths} months — the date it was done is enough.`}
            </span>
          )}
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Issued by <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            aria-label="Issued by"
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Dates only. The license number and the document itself belong in the personnel file — this
        screen exists so nothing lapses unnoticed, not to hold the paperwork.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void save()}
          className={buttonClass('primary', 'md')}
        >
          {busy ? 'Saving…' : 'Record it'}
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
