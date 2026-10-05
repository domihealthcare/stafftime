import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  isKioskUnpaired,
  kioskApi,
  type KioskEmployee,
  type KioskPunchResult,
  type KioskSession,
} from '../lib/api';
import { Alert, Spinner } from '../components/ui';
import { Keypad } from './Keypad';
import { KioskPairing } from './KioskPairing';
import { BrandMark } from '../components/Brand';
import { ClosingChecklistForm } from '../components/ClosingChecklistForm';
import type { ApplicableSection, ClosingSubmission } from '../lib/types';

const MAX_PIN_LENGTH = 8;
/// How long the confirmation stays up before returning to the staff list. Long
/// enough to read, short enough that the next person is not left waiting.
const CONFIRMATION_MS = 4000;
/// An abandoned PIN entry clears itself, so nobody walks up to a screen with
/// someone else's name and half a PIN on it.
const IDLE_RESET_MS = 30_000;
/// A closing checklist takes longer than a PIN, but one walked away from still
/// clears itself — nobody should find somebody else's half-ticked list.
const CHECKLIST_IDLE_RESET_MS = 5 * 60_000;
/// How long "you have no PIN yet" stays up before the staff list comes back.
const NO_PIN_MS = 20_000;

type Screen =
  | { name: 'loading' }
  | { name: 'pairing' }
  | { name: 'staff' }
  /// `closing` is set on the second PIN of a clock-out with a checklist.
  | { name: 'pin'; employee: KioskEmployee; closing?: ClosingSubmission }
  /// Somebody with no PIN yet tapped their name: how to choose one.
  | { name: 'no-pin'; employee: KioskEmployee }
  | { name: 'checklist'; employee: KioskEmployee; sections: ApplicableSection[] }
  | { name: 'done'; result: KioskPunchResult };

/**
 * The front-desk kiosk.
 *
 * Deliberately not part of the signed-in app: it has its own route, its own
 * device credential, and no navigation into timesheets or schedules. A tablet
 * left on the counter can clock people in and out, and nothing else.
 */
export function KioskApp() {
  const [session, setSession] = useState<KioskSession | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [staff, setStaff] = useState<KioskEmployee[]>([]);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const screenRef = useRef<string>('loading');

  const retryTimer = useRef<number | undefined>(undefined);
  const loadSession = useCallback(async () => {
    window.clearTimeout(retryTimer.current);
    try {
      const current = await kioskApi.session();
      setSession(current);
      setStaff(await kioskApi.employees());
      setError(null);
      setScreen({ name: 'staff' });
    } catch (err) {
      if (isKioskUnpaired(err)) {
        setScreen({ name: 'pairing' });
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
        setScreen({ name: 'staff' });
        // The computer often starts before its Wi-Fi does: keep trying, rather
        // than sitting dead until somebody thinks to reload the page.
        retryTimer.current = window.setTimeout(() => void loadSession(), 15_000);
      }
    }
  }, []);

  useEffect(() => {
    void loadSession();
    const online = () => void loadSession();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      window.clearTimeout(retryTimer.current);
    };
  }, [loadSession]);

  // Every ten minutes, fetch the staff list again: somebody added today shows
  // up without anybody reloading the page, and the server hears the time
  // clock is still open — which is what "gone quiet" is judged by.
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      kioskApi
        .employees()
        .then((list) => {
          setStaff(list);
          if (screenRef.current === 'staff') setError(null);
        })
        .catch(() => undefined);
    }, 10 * 60_000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    screenRef.current = screen.name;
  }, [screen]);

  const backToStaff = useCallback(() => {
    setPin('');
    setError(null);
    setScreen({ name: 'staff' });
  }, []);

  // Clear an abandoned PIN screen — but never while a PIN is being checked, or
  // the answer would land on whoever is next.
  useEffect(() => {
    window.clearTimeout(idleTimer.current);
    if (busy) return;
    if (screen.name === 'pin') {
      idleTimer.current = window.setTimeout(backToStaff, IDLE_RESET_MS);
    }
    if (screen.name === 'checklist') {
      idleTimer.current = window.setTimeout(backToStaff, CHECKLIST_IDLE_RESET_MS);
    }
    if (screen.name === 'no-pin') {
      idleTimer.current = window.setTimeout(backToStaff, NO_PIN_MS);
    }
    return () => window.clearTimeout(idleTimer.current);
  }, [screen, pin, busy, backToStaff]);

  /// Somebody ticking the closing checklist is still there: start its
  /// five minutes again.
  const stillHere = useCallback(() => {
    if (screen.name !== 'checklist') return;
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(backToStaff, CHECKLIST_IDLE_RESET_MS);
  }, [screen, backToStaff]);

  // Return to the staff list after a confirmation.
  useEffect(() => {
    if (screen.name !== 'done') {
      return;
    }
    const timer = window.setTimeout(backToStaff, CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [screen, backToStaff]);

  async function submitPin(employee: KioskEmployee, closing?: ClosingSubmission) {
    setBusy(true);
    setError(null);
    try {
      const result = await kioskApi.punch(employee.id, pin, closing);
      setPin('');
      if (result.action === 'CHECKLIST') {
        // Nothing punched yet: the checklist first, then the PIN again.
        setScreen({ name: 'checklist', employee, sections: result.checklist ?? [] });
        return;
      }
      setScreen({ name: 'done', result });
    } catch (err) {
      // The PIN is cleared on any failure — never left on screen to retry blind.
      setPin('');
      if (isKioskUnpaired(err)) {
        setScreen({ name: 'pairing' });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (screen.name === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spinner label="Starting kiosk" />
      </div>
    );
  }

  if (screen.name === 'pairing') {
    return <KioskPairing onPaired={() => void loadSession()} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 border-t-4 border-t-brand-600 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BrandMark />
            {session?.locationName ?? 'Kiosk'}
          </span>
          <Clock />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center p-6">
        {screen.name === 'staff' && (
          <StaffList
            staff={staff}
            error={error}
            onPick={(employee) =>
              setScreen(employee.hasPin ? { name: 'pin', employee } : { name: 'no-pin', employee })
            }
          />
        )}

        {screen.name === 'checklist' && (
          <div
            className="rounded-2xl bg-white p-6 shadow-sm"
            onPointerDown={stillHere}
            onKeyDown={stillHere}
          >
            <p className="mb-3 text-sm font-medium text-slate-500">
              {screen.employee.firstName} {screen.employee.lastName}
            </p>
            <ClosingChecklistForm
              large
              sections={screen.sections}
              busy={busy}
              onSubmit={(closing) => setScreen({ name: 'pin', employee: screen.employee, closing })}
              onSkip={() =>
                setScreen({ name: 'pin', employee: screen.employee, closing: { skipped: true } })
              }
              onCancel={backToStaff}
            />
          </div>
        )}

        {screen.name === 'pin' && (
          <PinEntry
            confirming={Boolean(screen.closing)}
            employee={screen.employee}
            pin={pin}
            busy={busy}
            error={error}
            onDigit={(digit) => setPin((current) => current + digit)}
            onBackspace={() => setPin((current) => current.slice(0, -1))}
            onSubmit={() => void submitPin(screen.employee, screen.closing)}
            onCancel={backToStaff}
          />
        )}

        {screen.name === 'no-pin' && <NoPinYet employee={screen.employee} onDone={backToStaff} />}

        {screen.name === 'done' && <Confirmation result={screen.result} onDone={backToStaff} />}
      </main>
    </div>
  );
}

function StaffList({
  staff,
  error,
  onPick,
}: {
  staff: KioskEmployee[];
  error: string | null;
  onPick: (employee: KioskEmployee) => void;
}) {
  return (
    <div>
      <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">
        Tap your name to clock in or out
      </h1>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {staff.length === 0 && !error ? (
        <Alert tone="warning">
          Nobody works at this office yet. An administrator adds people to it from Manage → Staff in
          Domi Staff.
        </Alert>
      ) : staff.length === 0 ? null : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {staff.map((employee) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => onPick(employee)}
              className="rounded-2xl bg-white px-4 py-6 text-lg font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95"
            >
              <span className="block">{employee.firstName}</span>
              <span className="block text-sm font-normal text-slate-500">{employee.lastName}</span>
              {!employee.hasPin && (
                <span className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                  No PIN yet
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/// Shown instead of the keypad to somebody who has not chosen a PIN. The tablet
/// never sets one: choosing a PIN takes the person's own password, on their own
/// phone, so nobody at the desk can set one for a colleague and clock in as them.
function NoPinYet({ employee, onDone }: { employee: KioskEmployee; onDone: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">
        {employee.firstName} {employee.lastName}
      </h1>
      <p className="mt-3 text-lg text-slate-800">You have not chosen a PIN yet.</p>
      <ol className="mt-4 list-decimal space-y-1 pl-6 text-left text-base text-slate-700">
        <li>
          On your phone, open <strong>Domi Staff</strong>.
        </li>
        <li>
          Tap your photo or initials, then <strong>Your profile</strong>.
        </li>
        <li>
          Under <strong>Tablet PIN</strong>, choose 4 to 8 digits.
        </li>
      </ol>
      <p className="mt-4 text-sm text-slate-600">
        Until then, clock in on your phone. You can use the time clock as soon as it is saved.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-6 w-full rounded-xl bg-brand-600 px-4 py-3 text-lg font-medium text-white hover:bg-brand-700"
      >
        OK
      </button>
    </div>
  );
}

function PinEntry({
  confirming = false,
  employee,
  pin,
  busy,
  error,
  onDigit,
  onBackspace,
  onSubmit,
  onCancel,
}: {
  /// The second PIN of a clock-out, after the closing checklist.
  confirming?: boolean;
  employee: KioskEmployee;
  pin: string;
  busy: boolean;
  error: string | null;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          {employee.firstName} {employee.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {confirming ? 'Enter your PIN again to clock out' : 'Enter your PIN'}
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Keypad
        length={pin.length}
        maxLength={MAX_PIN_LENGTH}
        disabled={busy}
        onDigit={onDigit}
        onBackspace={onBackspace}
        onSubmit={onSubmit}
      />

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="mt-6 w-full py-3 text-center text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
      >
        {busy ? 'Checking…' : 'Cancel'}
      </button>
    </div>
  );
}

function Confirmation({ result, onDone }: { result: KioskPunchResult; onDone: () => void }) {
  const clockedIn = result.action === 'CLOCKED_IN';
  const time = new Date(result.at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <button
      type="button"
      onClick={onDone}
      className="mx-auto w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm"
    >
      <div
        className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ${
          clockedIn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
        }`}
        aria-hidden="true"
      >
        ✓
      </div>

      <h1 className="mt-5 text-2xl font-semibold text-slate-900">
        {clockedIn ? 'Clocked in' : 'Clocked out'}
      </h1>
      <p className="mt-1 text-lg text-slate-700">{result.employeeName}</p>
      <p className="mt-3 text-sm text-slate-600">
        {time} · {result.locationName}
      </p>

      {result.workedMinutes !== undefined && (
        <p className="mt-2 text-sm text-slate-600">
          {formatWorked(result.workedMinutes)} on the clock
        </p>
      )}
      {clockedIn && result.isLate && (
        <p className="mt-2 text-sm text-amber-700">Recorded as late for your shift.</p>
      )}

      <p className="mt-6 text-xs text-slate-500">Tap anywhere to continue</p>
    </button>
  );
}

function formatWorked(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="tabular-nums text-lg text-slate-600">
      {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
    </span>
  );
}
