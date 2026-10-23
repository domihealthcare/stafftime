import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, PAY_LOCKED, PAY_UNLOCKED } from '../lib/api';
import type { PayLockStatus } from '../lib/types';
import { Alert, Card, buttonClass, inputClass } from './ui';

/// How often an open pay screen checks whether it has sat unused too long.
const CHECK_EVERY_MS = 30_000;

const ACTIVITY = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

/**
 * Pay behind the PIN (October 2026, Dominguez: "anything that shows pay ...
 * even if the certain user has access to view it, should prompt them to
 * insert pin to view - sometimes a log in is left open and we dont want that
 * accessible to just anyone").
 *
 * Nothing inside is put on the page, or asked of the server, until the
 * person's tablet PIN (or their password) has been given on this session.
 * It stays open while they use it and locks again after a few minutes
 * without a touch or key, everywhere at once. The server refuses pay while it
 * is locked, so this is the screen's half of a rule the server keeps anyway.
 */
export function PinGate({
  children,
  what = 'pay',
  compact = false,
}: {
  children: ReactNode;
  /// What is behind it, for the prompt: "pay", "the rota's cost".
  what?: string;
  /// One line, for a card on a busier screen (the rota's cost).
  compact?: boolean;
}) {
  const [status, setStatus] = useState<PayLockStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .payLock()
      .then((found) => {
        setStatus(found);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not check.'));
  }, []);

  useEffect(() => {
    load();
    const locked = () => setStatus((now) => (now ? { ...now, unlocked: false, until: null } : now));
    window.addEventListener(PAY_LOCKED, locked);
    window.addEventListener(PAY_UNLOCKED, load);
    return () => {
      window.removeEventListener(PAY_LOCKED, locked);
      window.removeEventListener(PAY_UNLOCKED, load);
    };
  }, [load]);

  useIdleLock(status?.unlocked === true, status?.minutes ?? 10);

  if (error) return <Alert tone="warning">{error}</Alert>;
  if (!status) return null;
  if (status.unlocked) return <>{children}</>;
  return (
    <PinPrompt
      hasPin={status.hasPin}
      what={what}
      compact={compact}
      onUnlocked={(next) => {
        setStatus(next);
        window.dispatchEvent(new Event(PAY_UNLOCKED));
      }}
    />
  );
}

/// While pay is open: a use of the page keeps it open on the server, and
/// `minutes` with none locks it.
function useIdleLock(unlocked: boolean, minutes: number) {
  const lastActivity = useRef(Date.now());
  const lastTouch = useRef(Date.now());

  useEffect(() => {
    if (!unlocked) return;
    lastActivity.current = Date.now();
    lastTouch.current = Date.now();
    const seen = () => {
      lastActivity.current = Date.now();
    };
    for (const kind of ACTIVITY) window.addEventListener(kind, seen, { passive: true });
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActivity.current >= minutes * 60_000) {
        void api.lockPay().finally(() => window.dispatchEvent(new Event(PAY_LOCKED)));
      } else if (lastActivity.current > lastTouch.current && now - lastTouch.current >= 60_000) {
        lastTouch.current = now;
        void api
          .touchPay()
          .then((found) => {
            if (!found.unlocked) window.dispatchEvent(new Event(PAY_LOCKED));
          })
          .catch(() => undefined);
      }
    }, CHECK_EVERY_MS);
    return () => {
      for (const kind of ACTIVITY) window.removeEventListener(kind, seen);
      window.clearInterval(timer);
    };
  }, [unlocked, minutes]);
}

function PinPrompt({
  hasPin,
  what,
  compact,
  onUnlocked,
}: {
  hasPin: boolean;
  what: string;
  compact: boolean;
  onUnlocked: (status: PayLockStatus) => void;
}) {
  const [usePassword, setUsePassword] = useState(!hasPin);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.unlockPay(usePassword ? { password: value } : { pin: value });
      setValue('');
      onUnlocked(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check it.');
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const label = usePassword ? 'Your password' : 'Your tablet PIN';
  const form = (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2"
      aria-label={`Unlock ${what}`}
    >
      <label className="block">
        <span className={compact ? 'sr-only' : 'block text-sm font-medium text-slate-700'}>
          {label}
        </span>
        <input
          type="password"
          inputMode={usePassword ? undefined : 'numeric'}
          autoComplete={usePassword ? 'current-password' : 'off'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={compact ? label : undefined}
          className={`${inputClass} ${compact ? 'w-40' : 'mt-1 w-48'}`}
          data-testid="pay-pin"
          autoFocus={!compact}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !value}
        className={buttonClass('primary', compact ? 'sm' : 'md')}
      >
        {busy ? 'Checking…' : 'Show'}
      </button>
      <button
        type="button"
        className="tap text-sm text-brand-700 underline"
        onClick={() => {
          setUsePassword((now) => !now);
          setValue('');
          setError(null);
        }}
      >
        {usePassword ? 'Use your PIN instead' : 'Use your password instead'}
      </button>
    </form>
  );

  if (compact) {
    return (
      // Folded, so a busy screen is not led by a PIN box every visit.
      <details
        className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-slate-200"
        data-testid="pin-gate"
      >
        <summary className="cursor-pointer">
          <span aria-hidden="true">🔒 </span>Enter your PIN to see {what}
        </summary>
        <div className="mt-2">{form}</div>
        {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}
      </details>
    );
  }

  return (
    <div className="mx-auto max-w-md py-8" data-testid="pin-gate">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          <span aria-hidden="true">🔒 </span>Enter your PIN to see {what}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Pay is locked whenever a screen has been left for a few minutes, in case somebody walks up
          to a computer that is still signed in.
          {!hasPin &&
            ' You have no tablet PIN yet, so use your password, or choose a PIN on Your profile.'}
        </p>
        <div className="mt-4">{form}</div>
        {error && (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}

/// A small "Lock pay now" for a pay screen's corner, for somebody walking
/// away from the desk.
export function LockPayButton() {
  return (
    <button
      type="button"
      className={buttonClass('secondary', 'sm')}
      onClick={() => {
        void api.lockPay().finally(() => window.dispatchEvent(new Event(PAY_LOCKED)));
      }}
    >
      <span aria-hidden="true">🔒 </span>Lock pay now
    </button>
  );
}
