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

type Screen =
  | { name: 'loading' }
  | { name: 'pairing' }
  | { name: 'staff' }
  /// `closing` is set on the second PIN of a clock-out with a checklist.
  | { name: 'pin'; employee: KioskEmployee; closing?: ClosingSubmission }
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

  const loadSession = useCallback(async () => {
    try {
      const current = await kioskApi.session();
      setSession(current);
      setStaff(await kioskApi.employees());
      setScreen({ name: 'staff' });
    } catch (err) {
      if (isKioskUnpaired(err)) {
        setScreen({ name: 'pairing' });
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
        setScreen({ name: 'staff' });
      }
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Every ten minutes, fetch the staff list again: somebody added today shows
  // up without anybody reloading the page, and the server hears the time
  // clock is still open — which is what "gone quiet" is judged by.
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      kioskApi
        .employees()
        .then(setStaff)
        .catch(() => undefined);
    }, 10 * 60_000);
    return () => window.clearInterval(timer);
  }, [session]);

  const backToStaff = useCallback(() => {
    setPin('');
    setError(null);
    setScreen({ name: 'staff' });
  }, []);

  // Clear an abandoned PIN screen.
  useEffect(() => {
    window.clearTimeout(idleTimer.current);
    if (screen.name === 'pin') {
      idleTimer.current = window.setTimeout(backToStaff, IDLE_RESET_MS);
    }
    if (screen.name === 'checklist') {
      idleTimer.current = window.setTimeout(backToStaff, CHECKLIST_IDLE_RESET_MS);
    }
    return () => window.clearTimeout(idleTimer.current);
  }, [screen, pin, backToStaff]);

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
            onPick={(employee) => setScreen({ name: 'pin', employee })}
          />
        )}

        {screen.name === 'checklist' && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
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

      {staff.length === 0 ? (
        <Alert tone="warning">
          Nobody at this location has a kiosk PIN yet. An administrator can set them from Kiosks in
          the web app.
        </Alert>
      ) : (
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
            </button>
          ))}
        </div>
      )}
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
        className="mt-6 w-full py-3 text-center text-sm font-medium text-slate-500 hover:text-slate-900"
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

      <p className="mt-6 text-xs text-slate-400">Tap anywhere to continue</p>
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
