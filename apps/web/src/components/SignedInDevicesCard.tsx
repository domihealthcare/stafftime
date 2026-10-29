import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type AuthSession } from '../lib/api';
import { plural, t as translate, useT } from '../lib/i18n';
import { timeAgo } from '../lib/time-ago';
import { describeUserAgent } from '../lib/user-agent';
import { useConfirm } from './ConfirmDialog';
import { Alert, Badge, Card, Spinner, buttonClass } from './ui';

/**
 * Where you're signed in (October 2026, Dominguez: "sometimes a log in is
 * left open"): every phone and computer signed in as you, so one left open on
 * a colleague's phone, a home computer or the front-desk computer can be
 * signed out from here, one at a time or all but this one.
 *
 * The server says which is this device and refuses to sign it out this way;
 * leaving is the account menu's Sign out, which also tidies up this browser.
 */
export function SignedInDevicesCard() {
  const t = useT();
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // `translate`, not `t`: useT's function is new on every render, and as a
  // dependency here it would load the list over and over.
  const load = useCallback(async () => {
    try {
      setSessions(await api.listSessions());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : translate('Could not load where you are signed in.'),
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function describe(session: AuthSession): string {
    const { browser, system } = describeUserAgent(session.userAgent);
    if (browser && system) return t('{browser} on {system}', { browser, system });
    if (browser) return browser;
    if (system) return t('A browser on {system}', { system });
    return t('A browser');
  }

  async function act(work: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('That did not work.'));
    } finally {
      // Whatever happened, show the list as it now stands: one may have ended
      // by itself in the meantime.
      await load();
      setBusy(false);
    }
  }

  async function signOutOne(session: AuthSession) {
    const device = describe(session);
    const sure = await confirm({
      title: t('Sign out {device}?', { device }),
      body: t(
        'Whoever has it open will have to sign in again with your password. This device stays signed in.',
      ),
      confirmLabel: t('Yes, sign it out'),
      cancelLabel: t('Keep it signed in'),
    });
    if (!sure) return;
    await act(async () => {
      await api.revokeSession(session.id);
      return t('Signed out {device}.', { device });
    });
  }

  async function signOutOthers() {
    const sure = await confirm({
      title: t('Sign out everywhere else?'),
      body: t(
        'Every other phone and computer signed in as you will have to sign in again with your password. This device stays signed in.',
      ),
      confirmLabel: t('Yes, sign them out'),
      cancelLabel: t('Keep them signed in'),
    });
    if (!sure) return;
    await act(async () => {
      const { signedOut } = await api.revokeOtherSessions();
      return plural(signedOut, 'Signed out {n} other device.', 'Signed out {n} other devices.');
    });
  }

  const others = sessions?.filter((session) => !session.current) ?? [];

  return (
    <Card className="mb-4 p-5" testId="signed-in-devices">
      <h2 className="text-base font-semibold text-slate-900">{t('Where you’re signed in')}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {t(
          'The phones and computers signed in as you. If one is a phone or computer you no longer use, or somebody else’s, sign it out here.',
        )}
      </p>

      {notice && (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {sessions === null ? (
        !error && (
          <div className="mt-3">
            <Spinner label={t('Loading')} />
          </div>
        )
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sessions.map((session) => (
              <li
                key={session.id}
                data-testid="signed-in-device"
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {describe(session)}
                    {session.current && <Badge tone="success">{t('This device')}</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('Signed in {when}', { when: timeAgo(session.createdAt) })}
                    {' · '}
                    {session.current
                      ? t('In use now')
                      : t('Last used {when}', { when: timeAgo(session.lastUsedAt) })}
                  </p>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signOutOne(session)}
                    className={buttonClass('secondary', 'sm')}
                    aria-label={t('Sign out {device}', { device: describe(session) })}
                  >
                    {t('Sign out')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {others.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              {t('Only this device is signed in as you.')}
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void signOutOthers()}
              className={`mt-3 ${buttonClass('secondary', 'md')}`}
            >
              {t('Sign out everywhere else')}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
