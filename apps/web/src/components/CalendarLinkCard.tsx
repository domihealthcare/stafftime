import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useConfirm } from './ConfirmDialog';
import { Alert, Card } from './ui';

/**
 * A personal calendar subscription URL.
 *
 * A subscription rather than a one-off download: the calendar app re-fetches it,
 * so a shift added next month appears without anyone doing anything. Works the
 * same in Google Calendar, Apple Calendar and Outlook, which is why this is one
 * feature and not three integrations.
 */
export function CalendarLinkCard() {
  const [token, setToken] = useState<string | null>(null);
  const [hasLink, setHasLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const link = await api.calendarLink();
      setHasLink(link.hasLink);
      setToken(link.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check your calendar link.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const url = token ? `${window.location.origin}/api/calendar/${token}/domi.ics` : null;

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.issueCalendarLink();
      setToken(result.token);
      setHasLink(true);
      setOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a link.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const sure = await confirm({
      title: 'Turn off calendar syncing?',
      body: 'Your shifts will disappear from any calendar subscribed to the old link.',
      confirmLabel: 'Yes, turn it off',
      cancelLabel: 'Keep syncing',
    });
    if (!sure) return;
    setBusy(true);
    try {
      await api.revokeCalendarLink();
      setToken(null);
      setHasLink(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not turn that off.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the URL is on screen to copy by hand.
      setError('Could not copy automatically — select the address and copy it.');
    }
  }

  if (loading) {
    return null;
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Your calendar</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {hasLink
              ? 'Syncing is on. Your shifts and approved time off appear in your own calendar.'
              : 'Add your shifts to Google Calendar, Apple Calendar or Outlook.'}
          </p>
        </div>

        {hasLink ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {open ? 'Close' : 'Show link'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void issue()}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? 'Setting up…' : 'Turn on syncing'}
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
          <label htmlFor="calendar-url" className="block text-sm font-medium text-slate-700">
            Your private calendar address
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
              onClick={() => void copy()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div>
              <p className="font-medium">Google Calendar</p>
              <p className="text-slate-600">
                Other calendars → <strong>+</strong> → From URL → paste → Add calendar.
              </p>
            </div>
            <div>
              <p className="font-medium">iPhone or iPad</p>
              <p className="text-slate-600">
                Settings → Apps → Calendar → Accounts → Add Account → Other → Add Subscribed
                Calendar → paste.
              </p>
            </div>
            <div>
              <p className="font-medium">Outlook</p>
              <p className="text-slate-600">
                Add calendar → Subscribe from web → paste.
              </p>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
            Keep this address to yourself. Anyone who has it can see your schedule without
            signing in — that is how calendar subscriptions work. If it gets out, regenerate
            it below.
          </p>

          <p className="mt-3 text-xs text-slate-500">
            Calendars usually check for changes every few hours, so a new shift may take a
            while to appear.
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void issue()}
              disabled={busy}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              Regenerate the link
            </button>
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={busy}
              className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
            >
              Turn off syncing
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
