import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import { useIsAdmin, useIsManager } from '../lib/session';
import type { Credential, CredentialKind, Employee } from '../lib/types';

const KINDS: { value: CredentialKind; label: string }[] = [
  { value: 'LICENSE', label: 'Professional licence' },
  { value: 'CERTIFICATION', label: 'Certification' },
  { value: 'LIFE_SUPPORT', label: 'CPR / BLS / ACLS' },
  { value: 'REGISTRATION', label: 'Registration (DEA, NPI…)' },
  { value: 'IMMUNIZATION', label: 'Immunization' },
  { value: 'BACKGROUND_CHECK', label: 'Background check' },
  { value: 'OTHER', label: 'Something else' },
];

const KIND_LABEL = Object.fromEntries(KINDS.map((kind) => [kind.value, kind.label]));

type Horizon = '30' | '60' | '180' | 'all';

/**
 * Licences, certifications and anything else that has to be renewed.
 *
 * The compliance risk this screen exists for is a quiet one: nobody notices a
 * lapsed licence until somebody asks to see it. So the default view is what is
 * about to lapse, soonest first, rather than everything the practice holds.
 */
export function CredentialsPage() {
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [horizon, setHorizon] = useState<Horizon>('60');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, people] = await Promise.all([
        api.listCredentials(horizon === 'all' ? {} : { withinDays: horizon }),
        isManager ? api.listEmployees() : Promise.resolve([]),
      ]);
      setCredentials(rows);
      setStaff(people);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load credentials.');
    } finally {
      setLoading(false);
    }
  }, [horizon, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  const expired = useMemo(() => credentials.filter((row) => row.expired), [credentials]);
  const upcoming = useMemo(() => credentials.filter((row) => !row.expired), [credentials]);

  if (loading) return <Spinner label="Loading credentials" />;

  return (
    <div>
      <PageHeading
        title={isManager ? 'Licences and certifications' : 'Your licences'}
        subtitle={
          isManager
            ? 'What has to be renewed, and when. Nobody notices a lapsed licence until somebody asks to see it.'
            : 'What the practice holds for you, and when it runs out.'
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

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
            onClick={() => setAdding(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Record one
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4">
          <CredentialForm
            staff={staff}
            onSaved={() => {
              setAdding(false);
              void load();
            }}
            onCancel={() => setAdding(false)}
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
    </div>
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
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const name =
    credential.employee.preferredName ??
    `${credential.employee.firstName} ${credential.employee.lastName}`;

  async function saveScan() {
    try {
      const { blob, filename } = await api.downloadCredentialScan(credential.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'Could not open that scan.');
    }
  }

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
            {credential.reference && ` · ${credential.reference}`}
          </p>
          {credential.notes && (
            <p className="mt-0.5 text-xs text-slate-600">{credential.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {credential.hasScan && (
            <button
              type="button"
              onClick={() => void saveScan()}
              className="text-xs font-medium text-brand-700 underline hover:text-brand-900"
            >
              {credential.filename}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setRenewing((open) => !open)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {renewing ? 'Cancel' : 'Renew'}
            </button>
          )}
          {canDelete &&
            (confirming ? (
              <span className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.deleteCredential(credential.id);
                      onChanged();
                    } catch (cause) {
                      onError(
                        cause instanceof ApiError ? cause.message : 'Could not delete that.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="font-semibold text-rose-700"
                >
                  Delete it
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="text-slate-500">
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs font-medium text-slate-400 hover:text-rose-700"
              >
                Delete
              </button>
            ))}
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

/// Renewing is the common act: the same credential, a new date, usually a new
/// scan. It is a small form rather than a trip through the full editor.
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
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateCredential(credential.id, { expiresOn });
      if (file) await api.uploadCredentialScan(credential.id, file);
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
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          New scan <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          aria-label="New scan"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="max-w-full text-xs text-slate-600"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save the renewal'}
      </button>
    </div>
  );
}

function CredentialForm({
  staff,
  onSaved,
  onCancel,
}: {
  staff: Employee[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<CredentialKind>('LICENSE');
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [reference, setReference] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCredential({
        employeeId,
        kind,
        name: name.trim(),
        issuer: issuer.trim() || undefined,
        reference: reference.trim() || undefined,
        expiresOn,
      });
      if (file) await api.uploadCredentialScan(created.id, file);
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
          <span className="mb-1 block font-medium text-slate-700">What it is</span>
          <input
            aria-label="What it is"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="NJ Registered Nurse licence"
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
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Issued by <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            aria-label="Issued by"
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Number <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            aria-label="Number"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          A scan <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          aria-label="A scan"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="max-w-full text-xs text-slate-600"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Only an admin, and the person it belongs to, can open it — a licence document
          carries more than a date.
        </span>
      </label>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || employeeId === '' || name.trim() === '' || expiresOn === ''}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
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
