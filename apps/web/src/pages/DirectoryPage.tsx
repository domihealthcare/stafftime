import { Avatar } from '../components/Avatar';
import { JobRoleTag } from '../components/JobRoleTag';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName, formatTime } from '../lib/format';
import { useSession } from '../lib/session';
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
          const here = people.filter((person) => person.onNow?.location.id === place.id);
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
            <PersonCard key={person.id} person={person} isYou={person.id === employee?.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ person, isYou }: { person: DirectoryEntry; isYou: boolean }) {
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
                In now · {person.onNow.location.name}
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
    </Card>
  );
}

function uniqueById<T extends { id: string; name: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
