import { Avatar } from '../components/Avatar';
import { JobRoleDot, JobRoleTag } from '../components/JobRoleTag';
import { HoverNote } from '../components/HoverNote';
import { ContactLines, PresenceBadges, homeHours } from '../components/PersonDetails';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePersonMenu } from '../components/PersonMenu';
import { Alert, Card, EmptyState, PageHeading, Spinner, buttonClass } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName } from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import type { DirectoryEntry, OfficeExtension } from '../lib/types';
import { OfficeExtensionsCard, extensionOf } from '../components/OfficeExtensions';

/// Long enough that the list is not a stale picture of the morning, short
/// enough not to matter to the server.
const REFRESH_MS = 60_000;

/**
 * Who works here, how to reach them, and who is in right now.
 *
 * "In now" comes from live clock-ins, so the front desk can answer "is Dr. X
 * in West New York today?" without phoning round. Working from home also
 * lists who has a work-from-home shift today and has not clocked in yet.
 */
export function DirectoryPage() {
  const { employee } = useSession();
  const isManager = useIsManager();
  const [people, setPeople] = useState<DirectoryEntry[]>([]);
  const [extensions, setExtensions] = useState<OfficeExtension[]>([]);
  const [search, setSearch] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "See profile" from a right-click arrives as ?person=id.
  const [searchParams, setSearchParams] = useSearchParams();
  const onlyPerson = searchParams.get('person');
  const navigate = useNavigate();
  const personMenu = usePersonMenu({
    onSeeSchedule: isManager
      ? (person) => navigate(`/schedule?person=${encodeURIComponent(person.id)}`)
      : undefined,
  });

  const load = useCallback(async () => {
    try {
      const [found, lines] = await Promise.all([
        api.directory(),
        // The extensions are extra: without them the Directory still works.
        api.extensions().catch(() => null),
      ]);
      setPeople(found);
      if (lines) setExtensions(lines);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Only while somebody is looking; coming back to it refreshes at once.
    const timer = window.setInterval(
      () => document.visibilityState === 'visible' && void load(),
      REFRESH_MS,
    );
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
      if (onlyPerson && person.id !== onlyPerson) return false;
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
  }, [people, search, jobRole, location, onlyPerson]);

  if (loading) return <Spinner label="Loading the directory" />;

  return (
    <div className="max-w-6xl">
      <PageHeading
        title="Directory"
        subtitle="Everyone at the practice, how to reach them, and who is in right now."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <section aria-label="In now" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <div className="mt-2 space-y-2">
                  {byJobRole(here).map((group) => (
                    <div key={group.key} data-testid={`in-now-group-${group.label}`}>
                      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <JobRoleDot colour={group.colour} />
                        {group.label}
                      </p>
                      <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-sm text-slate-800">
                        {group.people.map((person) => (
                          <li key={person.id} className="flex items-center gap-1.5">
                            <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
                            {displayName(person)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        <HomeToday people={people} extensions={extensions} />
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

      {!onlyPerson && (
        <OfficeExtensionsCard
          lines={extensions}
          search={search}
          canEdit={isManager}
          onSaved={setExtensions}
        />
      )}

      {onlyPerson && (
        <p className="mb-3 text-sm text-slate-700">
          Showing one person.{' '}
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="font-medium text-brand-700 underline"
          >
            Show everyone
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState>Nobody matches that.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              onContextMenu={(event) =>
                personMenu.open(event, { id: person.id, name: displayName(person) })
              }
              isYou={person.id === employee?.id}
              canResetPin={isManager && person.id !== employee?.id}
              extension={extensionOf(extensions, person.id)}
            />
          ))}
        </div>
      )}
      {personMenu.menu}
    </div>
  );
}

function PersonCard({
  person,
  isYou,
  canResetPin,
  extension,
  onContextMenu,
}: {
  onContextMenu: (event: React.MouseEvent) => void;
  person: DirectoryEntry;
  isYou: boolean;
  canResetPin: boolean;
  extension: OfficeExtension | null;
}) {
  const name = displayName(person);
  return (
    <Card className="p-4" testId={`person-${name}`}>
      <div className="flex gap-3" onContextMenu={onContextMenu}>
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
            <PresenceBadges entry={person} />
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

          <ContactLines
            person={person}
            extension={extension}
            fromHomeToday={Boolean(person.onNow?.remote || person.homeToday)}
          />
        </div>
      </div>
      {canResetPin && <PinReset person={person} />}
    </Card>
  );
}

/// Who is working from home today: clocked in from home now, then anybody
/// with a work-from-home shift today who is not on yet. Their hours are in a
/// note on the name, not on the line (Dominguez, October 2026). Always on screen, so
/// "nobody" is an answer and not a missing box.
function HomeToday({
  people,
  extensions,
}: {
  people: DirectoryEntry[];
  extensions: OfficeExtension[];
}) {
  /// The number that rings them at home, where the list has one.
  const dial = (person: DirectoryEntry) => {
    const number = extensionOf(extensions, person.id)?.homeExtension;
    return number ? ` · ext. ${number}` : '';
  };
  const now = people.filter((person) => person.onNow?.remote);
  const later = people
    .filter((person) => person.homeToday && !person.onNow?.remote)
    .sort((a, b) => a.homeToday!.startsAt.localeCompare(b.homeToday!.startsAt));
  return (
    <Card className="p-4 sm:col-span-2 lg:col-span-1" testId="in-now-home">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Working from home today
      </p>
      {now.length === 0 && later.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Nobody is working from home today.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-slate-800">
          {now.map((person) => (
            <li key={person.id} className="flex items-baseline gap-1.5">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />
              <span>
                {person.homeToday ? (
                  <HoverNote note={homeHours(person.homeToday)} testId="home-name">
                    {displayName(person)}
                  </HoverNote>
                ) : (
                  displayName(person)
                )}{' '}
                <span className="text-slate-500">· in now{dial(person)}</span>
              </span>
            </li>
          ))}
          {later.map((person) => (
            <li key={person.id} className="flex items-baseline gap-1.5" data-testid="home-later">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-violet-500"
              />
              <span>
                <HoverNote note={homeHours(person.homeToday!)} testId="home-name">
                  {displayName(person)}
                </HoverNote>{' '}
                <span className="text-slate-500">· not in yet{dial(person)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
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
            className={buttonClass('primary', 'sm')}
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
          className="tap text-sm font-medium text-slate-500 hover:text-slate-800"
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

/**
 * The people in now at one office, grouped by job role (Dominguez, October
 * 2026: "it should show what roles they are"), in the practice's order of job
 * roles. Somebody with several is listed once, under their first; nobody is
 * left out for having none.
 */
function byJobRole(people: DirectoryEntry[]) {
  const groups = new Map<
    string,
    { key: string; label: string; colour: string | null; order: number; people: DirectoryEntry[] }
  >();
  for (const person of people) {
    const role = person.jobRoles[0];
    const key = role?.id ?? 'none';
    const group = groups.get(key) ?? {
      key,
      label: role?.name ?? 'Other',
      colour: role?.colour ?? null,
      order: role ? (role.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER,
      people: [],
    };
    group.people.push(person);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}
