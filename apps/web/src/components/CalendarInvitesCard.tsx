import { useEffect, useState } from 'react';
import { ApiError, api, type CalendarInviteStatus } from '../lib/api';
import { Alert, Card, buttonClass } from './ui';

/**
 * How calendar invites are going, for admins (September 2026): shifts and
 * events sent from the "Domi Staff" Google calendar. The app keeps them up to
 * date after every save and every night; "Send now" is for the first time,
 * or after putting a problem right.
 */
export function CalendarInvitesCard() {
  const [status, setStatus] = useState<CalendarInviteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setStatus(await api.calendarInviteStatus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check calendar invites.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function sendNow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    let sent = 0;
    try {
      // A round at a time, so no one request runs long.
      for (let round = 0; round < 25; round += 1) {
        const result = await api.sendCalendarInvites();
        sent += result.sent + result.cancelled;
        setNotice(`${sent} sent so far…`);
        if (result.remaining === 0 || result.failed > 0) break;
      }
      setNotice(sent === 0 ? 'Nothing was waiting.' : `Done — ${sent} sent or updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send them.');
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  if (!status) return error ? <Alert>{error}</Alert> : null;

  return (
    <Card className="p-5" testId="calendar-invites-card">
      <h2 className="text-sm font-semibold text-slate-900">Calendar invites</h2>
      {!status.enabled ? (
        <p className="mt-1 text-sm text-slate-600">
          Off. Shifts and events reach people&rsquo;s phones through the calendar link on Schedule.
          To send them as invites from office@ instead, see &ldquo;Calendar invites&rdquo; in the
          Google set-up guide.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            On. Each published shift goes to the person on it two weeks ahead, and each event to the
            people it is for two months ahead, from the &ldquo;Domi Staff&rdquo; calendar under
            office@.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Out for what is coming</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{status.upcoming}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Waiting to go</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{status.pending}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Last sent</dt>
              <dd className="text-slate-900">
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Not yet'}
              </dd>
            </div>
          </dl>
          {status.lastError && (
            <div className="mt-3">
              <Alert>
                Google said: {status.lastError}. Nothing is lost — the app tries again after the
                next change and every night.
              </Alert>
            </div>
          )}
          {notice && <p className="mt-3 text-sm text-slate-700">{notice}</p>}
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <button
            type="button"
            onClick={() => void sendNow()}
            disabled={busy}
            className={`mt-4 ${buttonClass('primary', 'md')}`}
          >
            {busy ? 'Sending…' : 'Send now'}
          </button>
        </>
      )}
    </Card>
  );
}
