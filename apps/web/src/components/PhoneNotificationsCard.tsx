import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { pushState, turnOff, turnOn, type PushState } from '../lib/push';
import { Alert, Card, buttonClass } from './ui';
import { useT } from '../lib/i18n';

type Status = Awaited<ReturnType<typeof api.pushStatus>>;

/**
 * Phone notifications for this device (October 2026, Dominguez — "are we
 * able to do this since we dont have an iphone/android app?": yes). What
 * rings the bell also arrives on the phone's lock screen. On an iPhone it
 * needs Domi Staff on the Home Screen first. Each device is turned on and
 * off on itself.
 */
export function PhoneNotificationsCard() {
  const t = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [found, here] = await Promise.all([api.pushStatus(), pushState()]);
      setStatus(found);
      setState(here);
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!status) return null;

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : t('That did not work.'),
      );
    } finally {
      setBusy(false);
      void load();
    }
  }

  return (
    <Card className="mb-4 p-5" testId="phone-notifications">
      <h2 id="phone-notifications" className="text-base font-semibold text-slate-900">
        {t('Phone notifications')}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {t(
          'Get what rings the bell — shift changes, time off, reminders to clock in — on this phone’s lock screen. No app to download.',
        )}
      </p>
      <div className="mt-3 space-y-3 text-sm">
        {!status.available ? (
          <p className="text-slate-600">
            {t('Not switched on for the practice yet — an admin does that in Practice settings.')}
          </p>
        ) : state === 'unsupported' ? (
          <p className="text-slate-600">{t('This browser cannot show notifications.')}</p>
        ) : state === 'needs-home-screen' ? (
          <p className="text-slate-700">
            {t(
              'On an iPhone, put Domi Staff on your Home Screen first (in Safari: Share → Add to Home Screen), open it from there, and come back here. See Help → Put Domi Staff on your phone.',
            )}
          </p>
        ) : state === 'blocked' ? (
          <p className="text-slate-700">
            {t(
              'Notifications are blocked for Domi Staff on this device. Allow them in the phone’s settings (or the browser’s site settings), then come back here.',
            )}
          </p>
        ) : state === 'on' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-emerald-700">{t('✓ On for this device')}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => api.pushTest(), t('Sent — it should arrive in a moment.'))
              }
              className={buttonClass('secondary', 'sm')}
            >
              {t('Send me a test')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(turnOff, t('Turned off for this device.'))}
              className={buttonClass('secondary', 'sm')}
            >
              {t('Turn off')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || !status.publicKey}
            onClick={() =>
              void act(() => turnOn(status.publicKey as string), t('Turned on for this device.'))
            }
            className={buttonClass('primary', 'sm')}
          >
            {busy ? t('Turning on…') : t('Turn on for this device')}
          </button>
        )}
        {notice && (
          <p role="status" className="text-emerald-700">
            {notice}
          </p>
        )}
        {error && <Alert>{error}</Alert>}
        {status.devices.length > 0 && (
          <p className="text-xs text-slate-500">
            {t('On for: {devices}. Turn one off on the device itself.', {
              devices: status.devices
                .map((d) =>
                  t('{device} (since {date})', {
                    device: d.device ?? t('a device'),
                    date: formatDate(d.createdAt),
                  }),
                )
                .join(', '),
            })}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Admins switch phone notifications on for everybody — on Practice settings. */
export function PhoneNotificationsSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .pushStatus()
      .then((found) => setOn(found.available))
      .catch(() => setOn(null));
  }, []);

  if (on === null) return null;
  return (
    <Card className="p-4" testId="phone-notifications-switch">
      <h2 className="text-base font-semibold text-slate-900">Phone notifications</h2>
      <p className="mt-1 text-sm text-slate-600">
        Lets everybody get what rings their bell on their phone’s lock screen, if they turn it on
        under Your profile. Sent through Apple’s or Google’s push service, encrypted so neither can
        read it. Nothing to download; on an iPhone, Domi Staff has to be on the Home Screen.
      </p>
      <div className="mt-3 text-sm">
        {on ? (
          <p className="font-medium text-emerald-700">✓ Switched on for the practice</p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.pushSwitchOn();
                setOn(true);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'That did not work.');
              } finally {
                setBusy(false);
              }
            }}
            className={buttonClass('primary', 'sm')}
          >
            {busy ? 'Switching on…' : 'Switch on for the practice'}
          </button>
        )}
        {error && (
          <div className="mt-2">
            <Alert>{error}</Alert>
          </div>
        )}
      </div>
    </Card>
  );
}
