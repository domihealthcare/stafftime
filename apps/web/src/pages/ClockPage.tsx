import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatDuration, formatTime } from '../lib/format';
import { GeolocationRefused, detectClockMethod, getCurrentPosition } from '../lib/geolocation';
import { useSession } from '../lib/session';
import type { ApplicableSection, ClosingSubmission, Shift, TimeEntry } from '../lib/types';
import { ClosingChecklistForm } from '../components/ClosingChecklistForm';
import { PrimaryAnnouncement } from '../components/PrimaryAnnouncement';
import { MyOvertimeNotice } from '../components/OvertimeAlerts';
import { Alert, Badge, Card, Spinner } from '../components/ui';

type Status = 'loading' | 'ready' | 'working';

export function ClockPage() {
  const { employee } = useSession();
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [todaysShift, setTodaysShift] = useState<Shift | null>(null);
  const [locationId, setLocationId] = useState<string>('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [offerKiosk, setOfferKiosk] = useState(false);
  /// Their closing checklist for the punch they are in, fetched ahead so that
  /// pressing Clock out can open it — or ask for the location — at once.
  const [checklist, setChecklist] = useState<ApplicableSection[]>([]);
  const [closing, setClosing] = useState(false);
  const [, forceTick] = useState(0);

  // Memoised: a fresh [] each render would re-run the default-location effect forever.
  const assignedLocations = useMemo(() => employee?.locations ?? [], [employee]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [current, shifts] = await Promise.all([
        api.currentEntry(),
        // Your own shifts: a manager's list would otherwise be everybody's.
        api.listShifts({ from: startOfToday(), to: endOfToday(), employeeId: employee?.id }),
      ]);
      setEntry(current);
      setChecklist(
        current && !current.clockOutAt
          ? await api
              .closingMine()
              .then((result) => result.sections)
              .catch(() => [])
          : [],
      );
      setTodaysShift(shifts[0] ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your status.');
    } finally {
      setStatus('ready');
    }
  }, [employee?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Default to the primary location, else the only one they have.
  useEffect(() => {
    if (locationId || assignedLocations.length === 0) {
      return;
    }
    const primary = assignedLocations.find((l) => l.isPrimary) ?? assignedLocations[0];
    setLocationId(primary.locationId);
  }, [assignedLocations, locationId]);

  // Keep the elapsed-time readout ticking while clocked in.
  useEffect(() => {
    if (!entry || entry.clockOutAt) {
      return;
    }
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [entry]);

  const isClockedIn = entry !== null && entry.clockOutAt === null;

  // A work-from-home shift on now (from half an hour before it starts, as the
  // server allows): no location needed, and none is asked for or sent.
  const now = Date.now();
  const remoteShift =
    todaysShift?.isRemote &&
    todaysShift.status === 'PUBLISHED' &&
    new Date(todaysShift.startsAt).getTime() - 30 * 60_000 <= now &&
    now < new Date(todaysShift.endsAt).getTime()
      ? todaysShift
      : null;
  const remote = isClockedIn ? entry?.clockInVerification === 'REMOTE' : remoteShift !== null;

  async function punch(direction: 'in' | 'out', closingAnswers?: ClosingSubmission) {
    setStatus('working');
    setError(null);
    setOfferKiosk(false);

    let position: Awaited<ReturnType<typeof getCurrentPosition>> | null = null;
    try {
      // Must run inside the click handler — the browser prompt needs the gesture.
      // Working from home, it is never asked for.
      position = remote ? null : await getCurrentPosition();
    } catch (err) {
      if (err instanceof GeolocationRefused) {
        // Not fatal: the server may still accept the punch from an office IP.
        setOfferKiosk(err.needsPermissionChange);
        setError(err.message);
      }
    }

    try {
      const coords = position
        ? {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracyMeters: position.accuracyMeters,
          }
        : {};

      const updated =
        direction === 'in'
          ? await api.clockIn({
              locationId: remoteShift?.locationId ?? locationId,
              method: detectClockMethod(),
              ...coords,
            })
          : await api.clockOut({ ...coords, closing: closingAnswers });

      setEntry(direction === 'in' ? updated : null);
      setClosing(false);
      setError(null);
      setOfferKiosk(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // 403 here means verification failed, and the kiosk is the way around it.
        setOfferKiosk(err.status === 403);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setStatus('ready');
    }
  }

  if (!employee) {
    return null;
  }

  const busy = status === 'working';

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PrimaryAnnouncement />
      <MyOvertimeNotice />

      <Card className="p-6 text-center">
        <p className="text-sm text-slate-500">
          {greeting()}, {employee.preferredName ?? employee.firstName}
        </p>

        {status === 'loading' ? (
          <div className="mt-6 flex justify-center">
            <Spinner label="Checking your status" />
          </div>
        ) : isClockedIn && entry ? (
          <>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-900">
              {formatDuration(entry.clockInAt, null)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Clocked in at {formatTime(entry.clockInAt)}
              {remote ? ' · Working from home' : entry.location ? ` · ${entry.location.name}` : ''}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Badge tone="success">On the clock</Badge>
              {entry.isLate && <Badge tone="warning">Late</Badge>}
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-2xl font-semibold text-slate-900">Not clocked in</p>
            {todaysShift ? (
              <p className="mt-1 text-sm text-slate-600">
                Today&rsquo;s shift: {formatTime(todaysShift.startsAt)} –{' '}
                {formatTime(todaysShift.endsAt)}
                {todaysShift.isRemote
                  ? ' · Work from home'
                  : todaysShift.location
                    ? ` · ${todaysShift.location.name}`
                    : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No shift scheduled today.</p>
            )}
          </>
        )}
      </Card>

      {!isClockedIn && !remote && assignedLocations.length > 1 && (
        <Card className="p-4">
          <label htmlFor="location" className="block text-sm font-medium text-slate-700">
            Location
          </label>
          <select
            id="location"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className="mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
          >
            {assignedLocations.map((assignment) => (
              <option key={assignment.locationId} value={assignment.locationId}>
                {assignment.location.name}
              </option>
            ))}
          </select>
        </Card>
      )}

      {error && (
        <Alert>
          <p>{error}</p>
          {offerKiosk && (
            <p className="mt-2 text-xs">
              The front-desk kiosk does not need location access and always works on site.
            </p>
          )}
        </Alert>
      )}

      {closing && isClockedIn ? (
        <Card className="p-4">
          <ClosingChecklistForm
            sections={checklist}
            busy={busy}
            onSubmit={(answers) => void punch('out', answers)}
            onSkip={() => void punch('out', { skipped: true })}
            onCancel={() => setClosing(false)}
          />
        </Card>
      ) : assignedLocations.length === 0 ? (
        <Alert tone="warning">
          You are not assigned to a location yet, so you cannot clock in. Ask a manager to assign
          you to North Bergen or West New York.
        </Alert>
      ) : (
        <button
          type="button"
          onClick={() =>
            isClockedIn && checklist.length > 0
              ? setClosing(true)
              : void punch(isClockedIn ? 'out' : 'in')
          }
          disabled={busy || status === 'loading'}
          className={`w-full rounded-xl px-6 py-5 text-lg font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isClockedIn
              ? 'bg-slate-700 hover:bg-slate-800 active:bg-slate-900'
              : 'bg-brand-600 hover:bg-brand-700 active:bg-brand-800'
          }`}
        >
          {busy
            ? remote
              ? 'Working…'
              : 'Checking your location…'
            : isClockedIn
              ? 'Clock out'
              : remote
                ? 'Clock in — working from home'
                : 'Clock in'}
        </button>
      )}

      <p className="px-2 text-center text-xs text-slate-500">
        {remote
          ? 'Working from home: no location is asked for or recorded.'
          : 'Clocking in from a browser shares your location with Domi Healthcare to confirm you are on site. It is recorded with your time entry.'}
      </p>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function startOfToday(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfToday(): string {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}
