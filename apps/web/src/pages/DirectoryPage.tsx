import { Avatar } from '../components/Avatar';
import { JobRoleTag } from '../components/JobRoleTag';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName, formatTime } from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import type { DirectoryEntry } from '../lib/types';

/// Long enough that the list is not a stale picture of the morning, short
/// enough not to matter to the server.
const REFRESH_MS = 60_000;

/**
 * Who works here, how to reach them, and who is in right now.
 *
 * "In now" comes from live clock-ins, so the front desk can answer "is Dr. X
 * in West New York today?" without phoning round.
 */
export function DirectoryPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const [people, setPeople] = useState<DirectoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPeople(await api.directory());
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const jobRoles = useMemo(() => uniqueById(people.flatMap((p) => p.jobRoles)), [people]);
  const locations = useMemo(
    () =>
      uniqueById(
        people.flatMap((p) => [
          ...p.locations.map(({ id, name }) => ({ id, name })),
          ...(p.onNow ? [p.onNow.location] : []),
        ]),
      ),
    [people],
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return people.filter((person) => {
      if (jobRole && !person.jobRoles.some((role) => role.id === jobRole)) return false;
      if (location && !person.locations.some((place) => place.id === location)) return false;
      if (!needle) return true;
      const haystack = [
        person.firstName,
        person.lastName,
        person.preferredName ?? '',
        ...person.jobRoles.map((role) => role.name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [people, search, jobRole, location]);

  if (loading) return <Spinner label="Loading the directory" />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeading
        title="Directory"
        subtitle="Everyone at the practice, how to reach them, and who is in right now."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <section aria-label="In now" className="mb-6 grid gap-3 sm:grid-cols-2">
        {locations.map((place) => {
          // At the office — somebody on a work-from-home shift is listed apart.
          const here = people.filter(
            (person) => person.onNow?.location.id === place.id && !person.onNow.remote,
          );
          return (
            <Card key={place.id} className="p-4" testId={`in-now-${place.name}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                In now · {place.name}
              </p>
              {here.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Nobody is clocked in.</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-800">
                  {here.map((person) => (
                    <li key={person.id} className="flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
                      {displayName(person)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
        {people.some((person) => person.onNow?.remote) && (
          <Card className="p-4 sm:col-span-2" testId="in-now-home">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Working from home now
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-800">
              {people
                .filter((person) => person.onNow?.remote)
                .map((person) => (
                  <li key={person.id} className="flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-violet-500" />
                    {displayName(person)}
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </section>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <input
          aria-label="Search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or role"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          aria-label="Job role"
          value={jobRole}
          onChange={(event) => setJobRole(event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Every job role</option>
          {jobRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Both locations</option>
          {locations.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState>Nobody matches that.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              isYou={person.id === employee?.id}
              canResetPin={isManager && person.id !== employee?.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({
  person,
  isYou,
  canResetPin,
}: {
  person: DirectoryEntry;
  isYou: boolean;
  canResetPin: boolean;
}) {
  const name = displayName(person);
  return (
    <Card className="p-4" testId={`person-${name}`}>
      <div className="flex gap-3">
        <Avatar person={person} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">
              {name}
              {person.pronouns && (
                <span className="ml-1 text-sm font-normal text-slate-500">({person.pronouns})</span>
              )}
              {isYou && <span className="ml-1 font-normal text-slate-500">(you)</span>}
            </h2>
            {person.onNow && (
              <Badge tone="success">
                In now · {person.onNow.remote ? 'Working from home' : person.onNow.location.name}
                {person.onNow.since && ` since ${formatTime(person.onNow.since)}`}
              </Badge>
            )}
            {person.onLeave && <Badge tone="warning">On leave</Badge>}
          </div>

          {person.jobRoles.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {person.jobRoles.map((role) => (
                <JobRoleTag key={role.id} name={role.name} colour={role.colour} />
              ))}
            </p>
          )}
          {person.locations.length > 0 && (
            <p className="text-xs text-slate-500">
              {person.locations.map((place) => place.name).join(', ')}
            </p>
          )}
          {person.about && <p className="mt-1 text-sm text-slate-700">{person.about}</p>}

          <div className="mt-2 flex flex-col gap-0.5 text-sm">
            <a
              href={`mailto:${person.email}`}
              className="truncate text-brand-700 hover:text-brand-900"
            >
              {person.email}
            </a>
            {person.phone && (
              <a
                href={`tel:${person.phone.replace(/[^\d+]/g, '')}`}
                className="text-brand-700 hover:text-brand-900"
              >
                {person.phone}
              </a>
            )}
          </div>
        </div>
      </div>
      {canResetPin && <PinReset person={person} />}
    </Card>
  );
}

function uniqueById<T extends { id: string; name: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/// For a manager: give somebody who has forgotten their tablet PIN a new one
/// to use until they choose their own. A manager can set a PIN, never read one.
function PinReset({ person }: { person: DirectoryEntry }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.setKioskPin(person.id, pin);
      setMessage({
        ok: true,
        text: `New PIN set. Tell ${person.preferredName ?? person.firstName} in person; they can change it on their profile.`,
      });
      setPin('');
      setOpen(false);
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof ApiError ? err.message : 'Could not set that PIN.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 border-t border-slate-100 pt-2 text-sm">
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`pin-${person.id}`} className="sr-only">
            New tablet PIN for {person.firstName}
          </label>
          <input
            id={`pin-${person.id}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            placeholder="New PIN"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={busy || pin.length < 4}
            onClick={() => void save()}
            className="rounded-lg bg-brand-600 px-3 py-1 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Set PIN'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Set a new tablet PIN
        </button>
      )}
      {message && (
        <p
          role="status"
          className={`mt-1 text-xs ${message.ok ? 'text-emerald-700' : 'text-rose-700'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
