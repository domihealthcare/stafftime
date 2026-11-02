import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, api } from '../lib/api';
import { t as translate, useT } from '../lib/i18n';
import {
  alreadyOnThisDevice,
  deviceHasFaceId,
  offerSettled,
  passkeysSupported,
  settleOffer,
  setUpPasskey,
  unlockMethod,
  wasCancelled,
  type PasskeySummary,
} from '../lib/passkeys';
import { useSession } from '../lib/session';
import { timeAgo } from '../lib/time-ago';
import { describeUserAgent } from '../lib/user-agent';
import { useConfirm } from './ConfirmDialog';
import { FaceIdIcon } from './FaceIdIcon';
import { PasswordField } from './PasswordField';
import { Alert, Badge, Card, Spinner, buttonClass } from './ui';

/// What this device calls it, in the reader's language.
function useMethod(): string {
  const t = useT();
  return t(unlockMethod());
}

/// For the start of a sentence: "A passkey is set up", not "a passkey".
const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * The button that sets Face ID up on this device, and the password it may
 * ask for first: the server wants it again unless they signed in in the last
 * few minutes (`PASSWORD_NEEDED`), so a browser left signed in cannot be used
 * to add somebody else's face.
 */
function SetUpButton({
  onDone,
  label,
}: {
  onDone: (passkeys: PasskeySummary[]) => void;
  label?: string;
}) {
  const t = useT();
  const method = useMethod();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await setUpPasskey(needsPassword ? password : undefined));
      setNeedsPassword(false);
      setPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PASSWORD_NEEDED') {
        setNeedsPassword(true);
      } else if (err instanceof ApiError && err.status === 401) {
        // A wrong password: try again.
        setError(err.message);
        setPassword('');
      } else {
        // Past the password, whatever happened next.
        setNeedsPassword(false);
        setPassword('');
        if (alreadyOnThisDevice(err)) {
          setError(t('{method} is already set up on this device.', { method: sentence(method) }));
        } else if (!wasCancelled(err)) {
          setError(err instanceof ApiError ? err.message : t('That did not work.'));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert>{error}</Alert>}
      {needsPassword ? (
        <form onSubmit={(event) => void go(event)} className="space-y-3">
          <PasswordField
            id="passkey-password"
            label={t('Your password')}
            value={password}
            onChange={setPassword}
            autoFocus
            hint={t('To check it is you before {method} is set up.', { method })}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !password}
              className={buttonClass('primary', 'md')}
            >
              {busy ? t('Setting it up…') : t('Continue')}
            </button>
            <button
              type="button"
              onClick={() => {
                setNeedsPassword(false);
                setPassword('');
              }}
              className={buttonClass('secondary', 'md')}
            >
              {t('Cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void go()}
          className={`inline-flex items-center gap-2 ${buttonClass('primary', 'md')}`}
          data-testid="set-up-passkey"
        >
          <FaceIdIcon />
          {busy ? t('Setting it up…') : (label ?? t('Set up {method} on this device', { method }))}
        </button>
      )}
    </div>
  );
}

/**
 * Face ID on Your profile (November 2026, Dominguez: "staff can use face id
 * through their phone to login to portal"): set it up on this device, see
 * where else it is, and remove one. The password always still works, and a
 * new password takes them all away.
 */
export function PasskeysCard() {
  const t = useT();
  const confirm = useConfirm();
  const { employee, refresh } = useSession();
  const method = useMethod();
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const supported = passkeysSupported();

  // Home's offer links here as /profile#passkeys.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#passkeys') return;
    const timer = window.setTimeout(() => box.current?.scrollIntoView({ block: 'start' }), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      setPasskeys(await api.passkeys());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translate('Could not load your passkeys.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // A shared account belongs to nobody's face; the server refuses it too.
  if (employee?.isSharedAccount) return null;

  function describe(passkey: PasskeySummary): string {
    const { browser, system } = describeUserAgent(passkey.userAgent);
    if (browser && system) return t('{browser} on {system}', { browser, system });
    if (browser) return browser;
    if (system) return t('A browser on {system}', { system });
    return t('A browser');
  }

  async function remove(passkey: PasskeySummary) {
    const sure = await confirm({
      title: t('Remove this passkey?'),
      body: t(
        'It will no longer sign you in. You can always sign in with your password, and set it up again.',
      ),
      confirmLabel: t('Yes, remove it'),
      cancelLabel: t('Keep it'),
    });
    if (!sure) return;
    setError(null);
    setNotice(null);
    try {
      setPasskeys(await api.removePasskey(passkey.id));
      setNotice(t('Removed.'));
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('That did not work.'));
    }
  }

  return (
    <div id="passkeys" ref={box} className="scroll-mt-20">
      <Card className="mb-4 p-5" testId="passkeys">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FaceIdIcon />
          {t('Sign in with Face ID')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t(
            'Use Face ID, Touch ID, a fingerprint or Windows Hello instead of typing your password. Your face or fingerprint stays on your phone or computer: Domi Staff never sees it. It also works where the app asks for your PIN. Your password still works too.',
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

        {passkeys === null ? (
          !error && (
            <div className="mt-3">
              <Spinner label={t('Loading')} />
            </div>
          )
        ) : passkeys.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{t('Not set up yet.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {passkeys.map((passkey) => (
              <li
                key={passkey.id}
                data-testid="passkey"
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {t('Set up in {device}', { device: describe(passkey) })}
                    {passkey.backedUp && <Badge>{t('On your other devices too')}</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('Added {when}', { when: timeAgo(passkey.createdAt) })}
                    {' · '}
                    {passkey.lastUsedAt
                      ? t('Last used {when}', { when: timeAgo(passkey.lastUsedAt) })
                      : t('Not used yet')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(passkey)}
                  className={buttonClass('secondary', 'sm')}
                  aria-label={t('Remove the passkey set up in {device}', {
                    device: describe(passkey),
                  })}
                >
                  {t('Remove')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {supported ? (
          <SetUpButton
            label={
              passkeys && passkeys.length > 0
                ? t('Set up {method} on this device too', { method })
                : undefined
            }
            onDone={(list) => {
              setPasskeys(list);
              setNotice(
                t('{method} is set up. Next time, sign in with it.', { method: sentence(method) }),
              );
              if (employee) settleOffer(employee.id, 'set-up');
              void refresh();
            }}
          />
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            {t('This browser cannot use Face ID or passkeys. Try Safari or Chrome on your phone.')}
          </p>
        )}
      </Card>
    </div>
  );
}

/**
 * On Home, after signing in with the password on a phone or computer that
 * has Face ID or the like: an offer to use it next time. A card, never a
 * pop-up (Dominguez turned down a pop-up at sign-in, November 2026), gone
 * for good on this device once set up or turned down.
 */
export function PasskeyOffer() {
  const t = useT();
  const { employee, refresh } = useSession();
  const method = useMethod();
  const [able, setAble] = useState(false);
  const [done, setDone] = useState<null | 'set-up' | 'not-now'>(null);

  const eligible =
    !!employee &&
    !employee.isSharedAccount &&
    !employee.viaPasskey &&
    !employee.viewingAs &&
    !offerSettled(employee.id);

  useEffect(() => {
    if (!eligible) return;
    let live = true;
    void deviceHasFaceId().then((has) => live && setAble(has));
    return () => {
      live = false;
    };
  }, [eligible]);

  if (!employee) return null;
  if (done === 'set-up') {
    return (
      <section
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm"
        data-testid="passkey-offer"
      >
        {t('{method} is set up. Next time, sign in with it.', { method: sentence(method) })}
      </section>
    );
  }
  if (!eligible || !able || done) return null;

  return (
    <section
      className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm"
      data-testid="passkey-offer"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <FaceIdIcon />
        {t('Sign in with {method} next time?', { method })}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {t(
          'No password to type on this device. Your face or fingerprint stays on it: Domi Staff never sees it.',
        )}
      </p>
      <SetUpButton
        label={t('Set up {method}', { method })}
        onDone={() => {
          settleOffer(employee.id, 'set-up');
          setDone('set-up');
          void refresh();
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button
          type="button"
          onClick={() => {
            settleOffer(employee.id, 'not-now');
            setDone('not-now');
          }}
          className="tap font-medium text-slate-600 hover:text-slate-900"
        >
          {t('Not now')}
        </button>
        <Link
          to="/profile#passkeys"
          className="tap font-medium text-brand-700 hover:text-brand-900"
        >
          {t('More about it')}
        </Link>
      </div>
    </section>
  );
}
