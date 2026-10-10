import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { KIND_STYLE } from '../lib/calendar-kinds';
import { SEPARATE_FEEDS } from '../lib/calendar-feeds';
import { t as translate, useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card, buttonClass } from './ui';

/**
 * A personal calendar subscription URL.
 *
 * A subscription rather than a one-off download: the calendar app re-fetches it,
 * so a shift added next month appears without anyone doing anything. Works the
 * same in Google Calendar, Apple Calendar and Outlook, which is why this is one
 * feature and not three integrations.
 */
export function CalendarLinkCard() {
  const t = useT();
  const { employee } = useSession();
  // Once shifts and events go out as invites (September 2026), the link
  // carries only closures and approved time off.
  const [invites, setInvites] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [hasLink, setHasLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  /// Which address was just copied: `domi`, or a separate calendar's slug.
  const [copied, setCopied] = useState<string | null>(null);
  /// Everything in one calendar, or one per kind (October 2026, Dominguez).
  const [separate, setSeparate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const link = await api.calendarLink();
      setHasLink(link.hasLink);
      setToken(link.token);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : translate('Could not check your calendar link.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api
      .appConfig()
      .then((config) => !cancelled && setInvites(Boolean(config.calendarInvites)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const feedUrl = (slug: string) =>
    token ? `${window.location.origin}/api/calendar/${token}/${slug}.ics` : null;
  const url = feedUrl('domi');

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.issueCalendarLink();
      setToken(result.token);
      setHasLink(true);
      setOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not create a link.'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const sure = await confirm({
      title: t('Turn off calendar syncing?'),
      body: t('Your shifts will disappear from any calendar subscribed to the old link.'),
      confirmLabel: t('Yes, turn it off'),
      cancelLabel: t('Keep syncing'),
    });
    if (!sure) return;
    setBusy(true);
    try {
      await api.revokeCalendarLink();
      setToken(null);
      setHasLink(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not turn that off.'));
    } finally {
      setBusy(false);
    }
  }

  async function copy(slug: string) {
    const address = feedUrl(slug);
    if (!address) {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setCopied(slug);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      // Clipboard access can be refused; the URL is on screen to copy by hand.
      setError(t('Could not copy automatically — select the address and copy it.'));
    }
  }

  if (loading) {
    return null;
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t('Your calendar')}</h2>
          {invites ? (
            <>
              <p className="mt-0.5 text-sm text-slate-600" data-testid="calendar-invites-note">
                {t(
                  'Your shifts (two weeks ahead) and practice events arrive as calendar invites to',
                )}{' '}
                <strong>{employee?.email}</strong> {t('— accept them if your calendar asks.')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {hasLink
                  ? t('Syncing is on for office closures and your approved time off.')
                  : t('Office closures and your approved time off can go in your calendar too.')}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-slate-600">
              {hasLink
                ? t(
                    'Syncing is on. Your shifts, approved time off and practice events appear in your own calendar.',
                  )
                : t(
                    'Add your shifts and practice events to Google Calendar, Apple Calendar or Outlook.',
                  )}
            </p>
          )}
        </div>

        {hasLink ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {open ? t('Close') : t('Show link')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void issue()}
            disabled={busy}
            className={buttonClass('primary', 'md')}
          >
            {busy ? t('Setting up…') : t('Turn on syncing')}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {open && url && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div
            className="mb-3 flex w-fit rounded-lg border border-slate-300 bg-white p-0.5"
            role="group"
            aria-label={t('How many calendars')}
          >
            {(
              [
                [false, 'Everything in one calendar'],
                [true, 'Separate calendars'],
              ] as const
            ).map(([option, text]) => (
              <button
                key={text}
                type="button"
                aria-pressed={separate === option}
                onClick={() => setSeparate(option)}
                className={`rounded-md px-3 py-1 text-sm font-medium max-sm:py-2 ${
                  separate === option
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(text)}
              </button>
            ))}
          </div>

          {separate ? (
            <div data-testid="separate-calendars">
              <p className="text-sm text-slate-600">
                {t(
                  'Add only the ones you want. Each shows on your phone as its own calendar, with its own colour and its own on/off. Use these instead of the all-in-one address, not as well, or everything shows twice.',
                )}
              </p>
              <ul className="mt-2 space-y-2">
                {SEPARATE_FEEDS.filter(
                  (feed) => !feed.providersOnly || employee?.usesClinicalForms,
                ).map((feed) => (
                  <li key={feed.slug}>
                    <label
                      htmlFor={`calendar-url-${feed.slug}`}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 rounded-full ${
                          feed.kind ? KIND_STYLE[feed.kind].dot : 'bg-brand-600'
                        }`}
                      />
                      {t(feed.label)}
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id={`calendar-url-${feed.slug}`}
                        type="text"
                        readOnly
                        value={feedUrl(feed.slug) ?? ''}
                        onFocus={(event) => event.currentTarget.select()}
                        className="w-full min-w-0 flex-1 rounded-lg border-slate-300 bg-slate-50 font-mono text-xs shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void copy(feed.slug)}
                        aria-label={t('Copy the {calendar} address', { calendar: t(feed.label) })}
                        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                      >
                        {copied === feed.slug ? t('Copied') : t('Copy')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <label htmlFor="calendar-url" className="block text-sm font-medium text-slate-700">
                {t('Your private calendar address')}
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  id="calendar-url"
                  type="text"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full min-w-0 flex-1 rounded-lg border-slate-300 bg-slate-50 font-mono text-xs shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => void copy('domi')}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                  {copied === 'domi' ? t('Copied') : t('Copy')}
                </button>
              </div>
            </>
          )}

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div>
              <p className="font-medium">Google Calendar</p>
              <p className="text-slate-600">
                {t('Other calendars →')} <strong>+</strong>{' '}
                {t('→ From URL → paste → Add calendar.')}
              </p>
            </div>
            <div>
              <p className="font-medium">{t('iPhone or iPad')}</p>
              <p className="text-slate-600">
                {t(
                  'Settings → Apps → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste.',
                )}
              </p>
            </div>
            <div>
              <p className="font-medium">Outlook</p>
              <p className="text-slate-600">{t('Add calendar → Subscribe from web → paste.')}</p>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
            {t(
              'Keep these addresses to yourself. Anyone who has one can see your schedule without signing in — that is how calendar subscriptions work. If one gets out, regenerate below: every address changes at once.',
            )}
          </p>

          <p className="mt-3 text-xs text-slate-500">
            {t(
              'Calendars usually check for changes every few hours, so a new shift may take a while to appear.',
            )}
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void issue()}
              disabled={busy}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              {t('Regenerate the link')}
            </button>
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={busy}
              className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
            >
              {t('Turn off syncing')}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
