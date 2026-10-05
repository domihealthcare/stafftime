import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { formatDuration, formatTime } from '../lib/format';
import { GeolocationRefused, detectClockMethod, getCurrentPosition } from '../lib/geolocation';
import { useSession } from '../lib/session';
import type { ApplicableSection, ClosingSubmission, Shift, TimeEntry } from '../lib/types';
import { ClosingChecklistForm } from '../components/ClosingChecklistForm';
import { BirthdaysThisWeek } from '../components/BirthdaysThisWeek';
import {
  ComingUp,
  HomeNews,
  QuickActions,
  SurveysCard,
  TabletPinReminder,
} from '../components/HomeCards';
import { SuggestionBoxCard } from '../components/SuggestionBox';
import { MyOvertimeNotice } from '../components/OvertimeAlerts';
import { Alert, Badge, Card, Spinner } from '../components/ui';
import { useConfirm } from '../components/ConfirmDialog';

type Status = 'loading' | 'ready' | 'working';

/// The "office" that is working from home, in the place list.
const HOME = 'home';

/// How early a work-from-home shift can be clocked into — the server's
/// REMOTE_EARLY_MINUTES.
const REMOTE_EARLY_MINUTES = 30;

/**
 * Home (October 2026, Dominguez — option B; it was the Clock screen): the
 * clock-in card and the news on the left two-thirds, and on the right third
 * quick buttons, birthdays, holidays and what is coming up, and surveys. On a
 * phone they stack — the clock first, the news last.
 */
export function ClockPage() {
  const { employee } = useSession();
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  /// Today's shifts, earliest first — somebody can have two (an office shift in
  /// the morning, working from home in the afternoon).
  const [todaysShifts, setTodaysShifts] = useState<Shift[]>([]);
  /// Where they are clocking in: one of their offices, or HOME. Every one is
  /// offered every day (October 2026, Dominguez); the shift's comes first.
  const [place, setPlace] = useState<string>('');
  /// Why somewhere other than the shift — optional.
  const [otherReason, setOtherReason] = useState('');
  const confirm = useConfirm();
  /// Once somebody picks a place themselves, the defaults below leave it alone.
  const [pickedByHand, setPickedByHand] = useState(false);
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
      // A removed shift is kept as CANCELLED; it is not today's shift.
      setTodaysShifts(
        shifts
          .filter((shift) => shift.status !== 'CANCELLED')
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
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

  // An installed app can sit in the background all day. Coming back to it —
  // after clocking in at the front desk, say — it must show the truth, not
  // what it knew this morning.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  // A work-from-home shift on now (from half an hour before it starts, as the
  // server allows): no location needed, and none is asked for or sent. Any of
  // today's shifts can be it, not only the first (fixed October 2026: an
  // office shift in the morning hid a work-from-home one in the afternoon).
  const now = Date.now();
  const remoteShift =
    todaysShifts.find(
      (shift) =>
        shift.isRemote &&
        shift.status === 'PUBLISHED' &&
        new Date(shift.startsAt).getTime() - REMOTE_EARLY_MINUTES * 60_000 <= now &&
        now < new Date(shift.endsAt).getTime(),
    ) ?? null;
  // The shift the card talks about: that one, else the one on now or next,
  // else the day's last.
  const todaysShift =
    remoteShift ??
    todaysShifts.find((shift) => now < new Date(shift.endsAt).getTime()) ??
    todaysShifts[todaysShifts.length - 1] ??
    null;

  const primaryOffice = (assignedLocations.find((l) => l.isPrimary) ?? assignedLocations[0])
    ?.locationId;
  /// Where today's shift is — HOME for a work-from-home one — if it is one of
  /// the places they can pick.
  const shiftPlace = !todaysShift
    ? null
    : todaysShift.isRemote
      ? HOME
      : (assignedLocations.find((l) => l.locationId === todaysShift.locationId)?.locationId ??
        null);
  /// The shift's place first, then their other offices, then home.
  const places = useMemo(() => {
    const all = [
      ...assignedLocations.map((l) => ({ value: l.locationId, label: l.location.name })),
      { value: HOME, label: 'Work from home' },
    ];
    const first = all.find((option) => option.value === shiftPlace);
    return first ? [first, ...all.filter((option) => option !== first)] : all;
  }, [assignedLocations, shiftPlace]);

  // Default to the place of today's shift, else the primary office, else the
  // only one they have. Everybody works at both offices, so "primary" alone
  // sent people at West New York to North Bergen (and the server now finds the
  // right one anyway, if they are standing at the other).
  useEffect(() => {
    if (pickedByHand || assignedLocations.length === 0) {
      return;
    }
    setPlace(shiftPlace ?? primaryOffice);
  }, [assignedLocations, shiftPlace, primaryOffice, pickedByHand]);

  // Keep the elapsed-time readout ticking while clocked in. It shows whole
  // minutes, so a quarter-minute keeps it right without redrawing every second.
  // With a work-from-home shift today it ticks anyway, so the page notices
  // when the shift's window opens without being reloaded.
  const remoteToday = todaysShifts.some((shift) => shift.isRemote);
  useEffect(() => {
    if ((!entry || entry.clockOutAt) && !remoteToday) {
      return;
    }
    const timer = window.setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [entry, remoteToday]);

  const isClockedIn = entry !== null && entry.clockOutAt === null;

  const remote = isClockedIn ? entry?.clockInVerification === 'REMOTE' : place === HOME;
  /// Somewhere other than the shift: another office than its own, or home
  /// without a work-from-home shift. Allowed, with a warning first.
  const elsewhere =
    !isClockedIn && place !== '' && (shiftPlace ? place !== shiftPlace : place === HOME);
  const placeName = (value: string | null) =>
    places.find((option) => option.value === value)?.label ?? '';
  const elsewhereNote = !elsewhere
    ? null
    : todaysShift
      ? `Your shift today is ${todaysShift.isRemote ? 'from home' : `at ${placeName(shiftPlace) || todaysShift.location?.name || 'another office'}`}.`
      : 'You have no work-from-home shift today.';

  /// The warning before clocking in somewhere other than the shift.
  async function clockInChecked() {
    if (elsewhere) {
      const go = await confirm({
        title: place === HOME ? 'Clock in from home?' : `Clock in at ${placeName(place)}?`,
        body: `${elsewhereNote} You can still clock in here — it will show on your timesheet${
          otherReason.trim() ? ', with your reason' : ''
        }, so your manager can see why.`,
        confirmLabel: place === HOME ? 'Clock in from home' : `Clock in at ${placeName(place)}`,
        cancelLabel: 'Go back',
        tone: 'neutral',
      });
      if (!go) return;
    }
    await punch('in');
  }

  async function punch(direction: 'in' | 'out', closingAnswers?: ClosingSubmission) {
    setStatus('working');
    setError(null);
    setOfferKiosk(false);

    let position: Awaited<ReturnType<typeof getCurrentPosition>> | null = null;
    let locationProblem: string | null = null;
    try {
      // Must run inside the click handler — the browser prompt needs the gesture.
      // Working from home, it is never asked for.
      position = remote ? null : await getCurrentPosition();
    } catch (err) {
      if (err instanceof GeolocationRefused) {
        // Not fatal: the server may still accept the punch from an office IP.
        setOfferKiosk(err.needsPermissionChange);
        setError(err.message);
        locationProblem = err.message;
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
              // From home it is counted under the shift's office, else their main one.
              locationId: place === HOME ? (todaysShift?.locationId ?? primaryOffice ?? '') : place,
              method: detectClockMethod(),
              workFromHome: place === HOME,
              ...(elsewhere && otherReason.trim() ? { otherPlaceReason: otherReason.trim() } : {}),
              ...coords,
            })
          : await api.clockOut({ ...coords, closing: closingAnswers });

      setEntry(direction === 'in' ? updated : null);
      if (direction === 'in') setOtherReason('');
      setClosing(false);
      setError(null);
      setOfferKiosk(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        // When the phone could not say where they are, that is the real reason
        // — the server's "allow location access" would only hide it.
        setError(err.status === 403 && locationProblem ? locationProblem : err.message);
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
    <div className="grid items-start gap-4 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:gap-6">
      <h1 className="sr-only">Home</h1>
      <div className="space-y-4 lg:col-span-2 lg:row-start-1" data-testid="home-clock">
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
                {remote
                  ? ' · Working from home'
                  : entry.location
                    ? ` · ${entry.location.name}`
                    : ''}
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
          {status !== 'loading' && todaysShift?.notes && (
            <p
              className="mt-2 whitespace-pre-line text-sm italic text-slate-700"
              data-testid="todays-shift-note"
            >
              <span aria-hidden="true">📝 </span>
              <span className="sr-only">Note on today&rsquo;s shift: </span>
              {todaysShift.notes}
            </p>
          )}
        </Card>

        {!isClockedIn && status !== 'loading' && assignedLocations.length > 0 && (
          <Card className="p-4">
            <label htmlFor="location" className="block text-sm font-medium text-slate-700">
              Location
            </label>
            <select
              id="location"
              value={place}
              onChange={(event) => {
                setPickedByHand(true);
                setPlace(event.target.value);
              }}
              className="mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600"
            >
              {places.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.value === shiftPlace ? ' — your shift' : ''}
                </option>
              ))}
            </select>
            {elsewhereNote && (
              <div
                className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200"
                data-testid="other-place"
              >
                <p>
                  <span className="font-semibold">{elsewhereNote}</span> You can still clock in
                  here; it will show on your timesheet.
                </p>
                <label htmlFor="other-reason" className="mt-2 block text-sm font-medium">
                  Why? <span className="font-normal text-amber-900">(optional)</span>
                </label>
                <input
                  id="other-reason"
                  value={otherReason}
                  onChange={(event) => setOtherReason(event.target.value)}
                  maxLength={200}
                  placeholder={
                    place === HOME
                      ? 'e.g. Approved to work from home today'
                      : 'e.g. Covering at this office'
                  }
                  className="mt-1 w-full rounded-lg border-amber-300 py-2 text-base shadow-sm placeholder:text-amber-800/60 focus:border-brand-600 focus:ring-brand-600 sm:text-sm"
                />
              </div>
            )}
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
                : isClockedIn
                  ? void punch('out')
                  : void clockInChecked()
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

      <aside
        aria-label="Quick and coming up"
        className="space-y-4 lg:col-start-3 lg:row-span-2 lg:row-start-1"
      >
        <TabletPinReminder />
        <QuickActions />
        <BirthdaysThisWeek />
        <ComingUp />
        <SurveysCard />
        <SuggestionBoxCard />
      </aside>

      <div className="lg:col-span-2 lg:row-start-2">
        <HomeNews />
      </div>
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
