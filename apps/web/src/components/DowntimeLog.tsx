import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { minutesWords, practiceTimeWords } from '../lib/downtime';
import { formatCalendarDate } from '../lib/format';
import { formatPracticeDateTime, practiceDate } from '../lib/practice-time';
import type { Downtime, DowntimeLog } from '../lib/types';
import { NeedsAttention } from './NeedsAttention';
import { Alert, Card, Field, Spinner, buttonClass, inputClass } from './ui';

/**
 * The log (October 2026, Dominguez: "there should be a log of this so we know
 * in the future what that downtime was caused by, how long, etc." and "a log
 * summary"): the year added up, then each downtime with who was contacted,
 * the updates, the cause, and the catch-up and shredding to tick off.
 */
export function DowntimeLogSection() {
  const [year, setYear] = useState<number | undefined>(undefined);
  const [log, setLog] = useState<DowntimeLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLog(await api.downtimeLog(year));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the log.');
    }
  }, [year]);
  useEffect(() => void load(), [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!log) return <Spinner label="Loading the log" />;

  const { summary } = log;
  const hours = (minutes: number) => minutesWords(minutes);
  return (
    <div className="space-y-5" data-testid="downtime-log">
      <NeedsAttention sections={['downtime']} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{log.year} so far</h2>
        {log.years.length > 1 && (
          <div className="w-32">
            <Field label="Year">
              {(props) => (
                <select
                  {...props}
                  className={inputClass}
                  value={log.year}
                  onChange={(event) => setYear(Number(event.target.value))}
                >
                  {log.years.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="downtime-summary">
        <Tile label="Downtimes" value={String(summary.count)} />
        <Tile label="Down in all" value={summary.count ? hours(summary.minutes) : 'None'} />
        <Tile label="The longest" value={summary.count ? hours(summary.longestMinutes) : 'None'} />
      </div>
      {summary.count > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Breakdown title="By cause" rows={summary.byCause} />
          <Breakdown title="What was down" rows={summary.bySystem} />
          <Breakdown
            title="By office"
            rows={summary.byOffice.map((row) => ({ label: row.office, ...row }))}
          />
        </div>
      )}

      <section aria-label="Each downtime" className="space-y-3">
        {log.downtimes.length === 0 && (
          <p className="text-sm text-slate-600">No downtimes in {log.year}.</p>
        )}
        {log.downtimes.map((downtime) => (
          <LoggedDowntime key={downtime.id} downtime={downtime} />
        ))}
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
    </Card>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; minutes: number }[];
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-800">{row.label}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{row.count}</td>
              <td className="py-1 text-right tabular-nums text-slate-700">
                {minutesWords(row.minutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LoggedDowntime({ downtime: first }: { downtime: Downtime }) {
  const [downtime, setDowntime] = useState(first);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [plan, setPlan] = useState(first.catchUpPlan ?? '');
  const [dueOn, setDueOn] = useState(first.catchUpDueOn ?? '');
  const today = practiceDate();

  const run = async (work: () => Promise<Downtime>) => {
    setWorking(true);
    setError(null);
    try {
      setDowntime(await work());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not save. Try again.');
    } finally {
      setWorking(false);
    }
  };

  const open = downtime.status !== 'ENDED';
  const overdue =
    !open &&
    !downtime.caughtUpAt &&
    downtime.catchUpDueOn !== null &&
    downtime.catchUpDueOn < today;
  const shredReady = downtime.shredOn !== null && downtime.shredOn <= today && !downtime.shreddedAt;

  return (
    <Card className="p-4" testId="downtime-logged">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{downtime.headline}</h3>
          <p className="text-sm text-slate-700">
            {formatPracticeDateTime(downtime.startsAt)}
            {downtime.endedAt ? (
              <>
                {' '}
                to {practiceTimeWords(downtime.endedAt)} · {minutesWords(downtime.minutes)}
              </>
            ) : (
              <> · {downtime.status === 'PLANNED' ? 'planned' : 'still on'}</>
            )}
          </p>
        </div>
        {downtime.causeLabel && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
            {downtime.causeLabel}
          </span>
        )}
      </div>
      {downtime.causeNote && <p className="mt-1 text-sm text-slate-800">{downtime.causeNote}</p>}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-brand-700">What happened</summary>
        <ul className="mt-2 space-y-1 text-slate-800">
          <li>
            Started {formatPracticeDateTime(downtime.startsAt)}
            {downtime.startedBy && <> by {downtime.startedBy}</>}
            {downtime.note && <>: {downtime.note}</>}
          </li>
          {downtime.toldCount !== null && (
            <li>
              {downtime.toldCount} {downtime.toldCount === 1 ? 'person' : 'people'} told
            </li>
          )}
          {downtime.contactsMade.map((made) => (
            <li key={`${made.label}-${made.doneAt}`}>
              Contacted {made.label}, {formatPracticeDateTime(made.doneAt)}
              {made.by && <> ({made.by})</>}
            </li>
          ))}
          {downtime.updates.map((update) => (
            <li key={update.id}>
              Update, {formatPracticeDateTime(update.createdAt)}
              {update.by && <> ({update.by})</>}: {update.body}
            </li>
          ))}
          {downtime.endedAt && (
            <li>
              Closed {formatPracticeDateTime(downtime.endedAt)}
              {downtime.endedBy && <> by {downtime.endedBy}</>}
            </li>
          )}
        </ul>
      </details>

      {!open && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <p className={`text-sm ${overdue ? 'font-semibold text-rose-800' : 'text-slate-800'}`}>
            Catch-up
            {downtime.catchUpDueOn
              ? ` by ${formatCalendarDate(downtime.catchUpDueOn, { year: false })}`
              : ''}
            {downtime.caughtUpAt
              ? `: done ${formatPracticeDateTime(downtime.caughtUpAt)}${downtime.caughtUpBy ? ` by ${downtime.caughtUpBy}` : ''}`
              : overdue
                ? ': past its day'
                : ''}
          </p>
          {downtime.catchUpPlan && !downtime.caughtUpAt && (
            <p className="whitespace-pre-line text-sm text-slate-700">{downtime.catchUpPlan}</p>
          )}
          {!downtime.caughtUpAt && downtime.minutes > 24 * 60 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-brand-700">
                Change the plan
              </summary>
              <div className="mt-2 space-y-2">
                <Field label="The plan">
                  {(props) => (
                    <textarea
                      {...props}
                      className={inputClass}
                      rows={2}
                      value={plan}
                      onChange={(event) => setPlan(event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Done by">
                  {(props) => (
                    <input
                      {...props}
                      type="date"
                      className={inputClass}
                      value={dueOn}
                      onChange={(event) => setDueOn(event.target.value)}
                    />
                  )}
                </Field>
                <button
                  type="button"
                  className={buttonClass('secondary', 'sm')}
                  disabled={working}
                  onClick={() =>
                    void run(() =>
                      api.setDowntimeCatchUp(downtime.id, {
                        catchUpPlan: plan,
                        catchUpDueOn: dueOn,
                      }),
                    )
                  }
                >
                  Save the plan
                </button>
              </div>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass(downtime.caughtUpAt ? 'secondary' : 'primary', 'sm')}
              disabled={working}
              onClick={() =>
                void run(() => api.markDowntimeCaughtUp(downtime.id, !downtime.caughtUpAt))
              }
            >
              {downtime.caughtUpAt ? 'Not caught up after all' : 'Mark caught up'}
            </button>
            {downtime.caughtUpAt && (
              <button
                type="button"
                className={buttonClass(shredReady ? 'primary' : 'secondary', 'sm')}
                disabled={working}
                onClick={() =>
                  void run(() => api.markDowntimeShredded(downtime.id, !downtime.shreddedAt))
                }
              >
                {downtime.shreddedAt ? 'Not shredded after all' : 'Mark the paper shredded'}
              </button>
            )}
          </div>
          {downtime.caughtUpAt && (
            <p className="text-xs text-slate-600">
              {downtime.shreddedAt
                ? `Paper shredded ${formatPracticeDateTime(downtime.shreddedAt)}${downtime.shreddedBy ? ` by ${downtime.shreddedBy}` : ''}.`
                : downtime.shredOn
                  ? `Keep the scanned paper until ${formatCalendarDate(downtime.shredOn, { year: false })}, then shred it.`
                  : ''}
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}
