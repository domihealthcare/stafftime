import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { practiceTimeWords } from '../lib/downtime';
import { formatCalendarDate } from '../lib/format';
import { useIsManager } from '../lib/session';
import type { DowntimeCheck, MyDowntimeCheck } from '../lib/types';
import { Alert, Card, Field, Spinner, buttonClass, inputClass } from './ui';

const monthWords = (month: string) =>
  new Date(`${month}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

/**
 * The monthly downtime check (October 2026, Dominguez: "this check monthly is
 * good, it can go easily missed - also should go to all the admin and they
 * should be able to provide feedback if they see something has changed in the
 * way we do stuff or maybe something new to include"): the stack at the front
 * desk, item by item, and anything to change in the procedures. Managers see
 * what each check found below it, and mark it read.
 */
export function DowntimeCheckSection() {
  const isManager = useIsManager();
  const [mine, setMine] = useState<MyDowntimeCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myDowntimeCheck()
      .then(setMine)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load it.'));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!mine) return <Spinner label="Loading the check" />;
  return (
    <div className="space-y-6">
      {(mine.asked || isManager) && <CheckForm mine={mine} onDone={setMine} />}
      {isManager && <ChecksFound />}
    </div>
  );
}

function CheckForm({
  mine,
  onDone,
}: {
  mine: MyDowntimeCheck;
  onDone: (mine: MyDowntimeCheck) => void;
}) {
  const [locationId, setLocationId] = useState(mine.offices[0]?.id ?? '');
  const [low, setLow] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [another, setAnother] = useState(false);

  if (mine.done && !another) {
    return (
      <div className="rounded-xl border shadow-sm border-emerald-300 bg-emerald-50 p-5" data-testid="downtime-check-done">
        <h2 className="text-base font-semibold text-emerald-900">
          Done for {monthWords(mine.month)}. Thank you.
        </h2>
        <p className="mt-1 text-sm text-emerald-900">
          You will be asked again on the 1st of next month.
        </p>
        <button
          type="button"
          className={`${buttonClass('secondary', 'sm')} mt-3`}
          onClick={() => setAnother(true)}
        >
          Check another office
        </button>
      </div>
    );
  }

  const submit = async () => {
    setWorking(true);
    setError(null);
    try {
      const next = await api.submitDowntimeCheck({
        locationId: locationId || undefined,
        lowItems: low,
        feedback: feedback.trim() || undefined,
      });
      setLow([]);
      setFeedback('');
      setAnother(false);
      onDone(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'It did not save. Try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="p-5" testId="downtime-check-form">
      <h2 className="text-base font-semibold text-slate-900">
        Monthly check: {monthWords(mine.month)}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        Look at the downtime stack at the front desk. Tick anything running low, and say if anything
        in how we do things has changed or should be added.
      </p>
      <div className="mt-4 space-y-4">
        {mine.offices.length > 1 && (
          <Field label="Office">
            {(props) => (
              <select
                {...props}
                className={inputClass}
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                {mine.offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Running low?</legend>
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {mine.items.map((item) => {
              const isLow = low.includes(item.label);
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-slate-800">
                    {item.label}
                    {item.quantity !== null && (
                      <span className="text-slate-600"> (keep {item.quantity})</span>
                    )}
                  </span>
                  <label className="flex shrink-0 items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-amber-600"
                      checked={isLow}
                      onChange={(event) =>
                        setLow(
                          event.target.checked
                            ? [...low, item.label]
                            : low.filter((label) => label !== item.label),
                        )
                      }
                    />
                    Low
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <Field
          label="Anything changed, or something to add? (optional)"
          hint="About how we do things: a number, a step, a form. Never a patient."
        >
          {(props) => (
            <textarea
              {...props}
              className={inputClass}
              rows={3}
              maxLength={2000}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
        <button
          type="button"
          className={buttonClass('primary')}
          disabled={working}
          onClick={() => void submit()}
        >
          {working
            ? 'Sending...'
            : low.length === 0 && !feedback.trim()
              ? 'All good: send'
              : 'Send'}
        </button>
      </div>
    </Card>
  );
}

function ChecksFound() {
  const [checks, setChecks] = useState<DowntimeCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .downtimeChecks()
      .then(setChecks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load them.'));
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!checks) return <Spinner label="Loading the checks" />;
  return (
    <section aria-label="What the checks found">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        What the checks found
      </h2>
      {checks.length === 0 ? (
        <p className="text-sm text-slate-600">No checks in the last three months.</p>
      ) : (
        <ul className="space-y-2" data-testid="downtime-checks">
          {checks.map((check) => (
            <li key={check.id}>
              <Card className={`p-4 ${check.readAt ? '' : 'border-amber-300'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm text-slate-900">
                    <span className="font-semibold">{check.by ?? 'Somebody'}</span>
                    {check.office && <> · {check.office.name}</>} ·{' '}
                    {formatCalendarDate(check.createdAt, { year: false })}
                  </p>
                  {check.readAt ? (
                    <span className="text-xs text-slate-600">
                      Read{check.readBy ? ` by ${check.readBy}` : ''},{' '}
                      {practiceTimeWords(check.readAt)}
                    </span>
                  ) : (
                    (check.lowItems.length > 0 || check.feedback) && (
                      <button
                        type="button"
                        className={buttonClass('secondary', 'sm')}
                        onClick={async () => setChecks(await api.readDowntimeCheck(check.id))}
                      >
                        Mark read
                      </button>
                    )
                  )}
                </div>
                {check.lowItems.length > 0 ? (
                  <p className="mt-1 text-sm text-amber-900">
                    Running low: {check.lowItems.join(', ')}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-emerald-800">Nothing running low.</p>
                )}
                {check.feedback && (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
                    “{check.feedback}”
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/// On Home, for the admin team and admins, until this month's check is done
/// (Dominguez: "it can go easily missed").
export function HomeDowntimeCheck() {
  const [mine, setMine] = useState<MyDowntimeCheck | null>(null);
  useEffect(() => {
    api
      .myDowntimeCheck()
      .then(setMine)
      .catch(() => undefined);
  }, []);
  if (!mine || !mine.asked || mine.done) return null;
  return (
    <div className="rounded-xl border shadow-sm border-amber-300 bg-amber-50 p-4" data-testid="home-downtime-check">
      <h2 className="text-sm font-semibold text-amber-950">
        Monthly downtime check: {monthWords(mine.month)}
      </h2>
      <p className="mt-1 text-sm text-amber-950">
        Look at the downtime stack at your front desk, and say if anything in the procedures has
        changed. It takes a minute.
      </p>
      <Link
        to="/downtime?tab=check"
        className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Do the check
      </Link>
    </div>
  );
}
