import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import type { PracticeOverview, PunchPattern } from '../lib/types';
import { Alert, Badge, Card, Spinner } from './ui';
import { clashDays, clashPeople } from './TimeOffClashes';
import { StaffPtoBalances } from './StaffPtoBalances';

/// How many lines a card lists before saying "and N more".
const SHOWN = 5;

/**
 * The Dashboard's second half (Dominguez, September 2026): what is waiting on
 * a manager, then licenses, surveys, onboarding and offboarding, and closing
 * checklists. Counts and short lists, each linking to the screen where the
 * thing is dealt with.
 */
export function PracticeOverviewSection() {
  const [data, setData] = useState<PracticeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .practiceOverview()
      .then((result) => !cancelled && setData(result))
      .catch(
        (cause) =>
          !cancelled &&
          setError(cause instanceof ApiError ? cause.message : 'Could not load the rest.'),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner label="Loading the rest of the dashboard" />;

  const {
    waiting,
    licenses,
    surveys,
    checklists,
    closing,
    patterns,
    timeOffClashes,
    overtimeForecast,
  } = data;

  return (
    <section aria-labelledby="practice-heading" data-testid="practice-overview">
      <h2
        id="practice-heading"
        className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        Across the practice
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <WaitingTile label="Time off to decide" count={waiting.timeOff} to="/time-off" />
        <WaitingTile label="Hours to approve" count={waiting.unapprovedHours} to="/timesheet" />
        <WaitingTile label="Clock-outs to correct" count={waiting.missingPunches} to="/timesheet" />
        <WaitingTile label="Shifts with no clock-in" count={waiting.missedShifts} to="/timesheet" />
        <WaitingTile
          label="Hours entered by hand to look into"
          count={waiting.handEntries}
          to="/timesheet"
        />
      </div>

      {/* Moved from Time off & balances (October 2026, Dominguez): managers and admins. */}
      <div className="mb-4">
        <StaffPtoBalances startOpen limit={6} title="Time off balances" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OvertimeForecastCard forecast={overtimeForecast} />
        <PatternsCard patterns={patterns} />

        <Card className="p-4" testId="overview-clashes">
          <CardHeading title="Too many off at once" to="/time-off" />
          <p className="mt-1 text-xs text-slate-500">
            The next {timeOffClashes.weeks} weeks: more than half of one job role at an office off
            the same day, approved or asked for.
          </p>
          <Lines
            items={timeOffClashes.clashes.map(
              (clash) =>
                `${clash.locationName}, ${clashDays(clash)} — ${
                  clash.off.length === clash.total
                    ? `all ${clash.total}`
                    : `${clash.off.length} of ${clash.total}`
                } in ${clash.jobRoleName} off: ${clashPeople(clash.off)}`,
            )}
            empty="Nobody short-handed."
          />
        </Card>

        <Card className="p-4" testId="overview-licenses">
          <CardHeading title="Licenses and certifications" to="/credentials" />
          <p className="mt-1 text-sm text-slate-700">
            <Count n={licenses.expired.length} tone="danger" /> lapsed ·{' '}
            <Count n={licenses.dueSoon.length} tone="warning" /> due in the next{' '}
            {licenses.withinDays} days · <Count n={licenses.missingRequired.length} tone="danger" />{' '}
            required not on file
          </p>
          <Lines
            items={[
              ...licenses.expired.map(
                (row) =>
                  `${row.employeeName} — ${row.name}, lapsed ${formatCalendarDate(row.expiresOn)}`,
              ),
              ...licenses.missingRequired.map(
                (row) => `${row.employeeName} — ${row.name}, not on file`,
              ),
              ...licenses.dueSoon.map(
                (row) =>
                  `${row.employeeName} — ${row.name}, ${
                    row.daysUntilExpiry === 0 ? 'expires today' : `${row.daysUntilExpiry} days left`
                  }`,
              ),
            ]}
            empty="Nothing lapsed, due or missing."
          />
        </Card>

        <Card className="p-4" testId="overview-surveys">
          <CardHeading title="Surveys" to="/surveys" />
          {surveys.surveys.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              No survey open or closed in the last 30 days.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {surveys.surveys.slice(0, SHOWN).map((survey) => (
                <li key={survey.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{survey.title}</span>
                  <Badge tone={survey.status === 'OPEN' ? 'info' : 'neutral'}>
                    {survey.status === 'OPEN' ? 'open' : 'closed'}
                  </Badge>
                  <span className="text-xs text-slate-600">
                    {survey.responses} of {survey.audienceSize} answered
                    {survey.status === 'CLOSED' &&
                      (survey.resultsShown ? ' · results ready' : ' · too few to show results')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {surveys.suggestionsLast30Days === 0
              ? 'No suggestions in the last 30 days.'
              : `${surveys.suggestionsLast30Days} suggestion${
                  surveys.suggestionsLast30Days === 1 ? '' : 's'
                } in the last 30 days.`}{' '}
            Answers stay anonymous — only counts are shown here.
          </p>
        </Card>

        <Card className="p-4" testId="overview-checklists">
          <CardHeading title="Onboarding and offboarding" to="/checklists" />
          {checklists.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Nobody is being onboarded or offboarded.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {checklists.slice(0, SHOWN).map((checklist) => (
                <li key={checklist.id}>
                  <span className="font-medium text-slate-900">{checklist.employeeName}</span> —{' '}
                  {checklist.kind === 'ONBOARDING' ? 'onboarding' : 'offboarding'}: {checklist.done}{' '}
                  of {checklist.total} done
                  {checklist.overdue > 0 && (
                    <span className="font-medium text-rose-700">
                      {' '}
                      · {checklist.overdue} overdue
                    </span>
                  )}
                </li>
              ))}
              {checklists.length > SHOWN && (
                <li className="text-xs text-slate-500">and {checklists.length - SHOWN} more</li>
              )}
            </ul>
          )}
        </Card>

        <Card className="p-4" testId="overview-closing">
          <CardHeading title="Closing checklists" to="/closing" />
          {closing.total === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              No closing checklists in the last {closing.days} days.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              Last {closing.days} days: {closing.total} clock-out{closing.total === 1 ? '' : 's'}{' '}
              with a checklist — <Count n={closing.complete} tone="success" /> complete,{' '}
              <Count n={closing.withGaps} tone="warning" /> with something missed,{' '}
              <Count n={closing.skipped} tone="danger" /> skipped.
            </p>
          )}
          <p className="mt-2 text-sm text-slate-700">
            {closing.suppliesToOrder.length === 0
              ? 'No supplies waiting to be ordered.'
              : `Supplies to order: ${closing.suppliesToOrder
                  .map((row) => `${row.office} ${row.count}`)
                  .join(', ')}.`}
          </p>
        </Card>
      </div>
    </section>
  );
}

/// Heading for overtime this week (October 2026): hours worked so far plus
/// what the rota still has them down for, past the line — in time to trim a
/// shift. The rota's own warning covers the schedule; this catches the early
/// starts and late finishes. Managers only.
function OvertimeForecastCard({ forecast }: { forecast: PracticeOverview['overtimeForecast'] }) {
  const { people, thresholdHours, weekStart } = forecast;
  const week = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <Card className="p-4" testId="overview-overtime-forecast">
      <CardHeading title="Heading for overtime this week" to="/timesheet" />
      <p className="mt-1 text-xs text-slate-500">
        The week from {week}: hours worked so far plus what is still on the rota, past{' '}
        {thresholdHours}. Hourly staff, both offices.
      </p>
      {people.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">Nobody on course for overtime.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          {people.slice(0, SHOWN).map((person) => (
            <li key={person.employeeId} data-testid="overtime-heading">
              <span className="font-medium text-slate-900">{person.employeeName}</span> —{' '}
              <span className="font-semibold text-amber-800">{person.projected} hrs</span>
              <span className="text-slate-600">
                {' '}
                ({person.worked} worked
                {person.stillScheduled > 0 ? ` + ${person.stillScheduled} still on the rota` : ''})
                {person.rota > thresholdHours
                  ? ' · the rota already had them over'
                  : ` · rota alone: ${person.rota}`}
              </span>
            </li>
          ))}
          {people.length > SHOWN && (
            <li className="text-xs text-slate-500">and {people.length - SHOWN} more</li>
          )}
        </ul>
      )}
    </Card>
  );
}

/// The same thing again and again (October 2026): late three times in four
/// weeks, forgetting to clock out or leaving early twice. Managers only, and
/// the person is not told — a reason to ask, not a verdict.
function PatternsCard({ patterns }: { patterns: PunchPattern[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="p-4" testId="overview-patterns">
      <CardHeading title="Patterns worth a word" to="/timesheet" />
      <p className="mt-1 text-xs text-slate-500">
        The last 4 weeks: late 3 times or more, or forgot to clock out or left early twice. Only
        managers see this, and nobody is told — it is a reason to ask, not a verdict.
      </p>
      {patterns.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">Nothing repeating.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          {patterns.slice(0, SHOWN).map((pattern) => {
            const key = `${pattern.employeeId}-${pattern.kind}`;
            return (
              <li key={key} data-testid="punch-pattern">
                <span className="font-medium text-slate-900">{pattern.employeeName}</span> —{' '}
                {pattern.summary}{' '}
                <button
                  type="button"
                  aria-expanded={open === key}
                  onClick={() => setOpen(open === key ? null : key)}
                  className="tap text-xs font-medium text-brand-700 hover:text-brand-900"
                >
                  {open === key ? 'Hide days' : 'Which days?'}
                </button>
                {open === key && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    {pattern.dates
                      .map((date) =>
                        new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC',
                        }),
                      )
                      .join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
          {patterns.length > SHOWN && (
            <li className="text-xs text-slate-500">and {patterns.length - SHOWN} more</li>
          )}
        </ul>
      )}
    </Card>
  );
}

function WaitingTile({ label, count, to }: { label: string; count: number; to: string }) {
  return (
    <Link
      to={to}
      data-testid={`waiting-${label}`}
      className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-brand-400"
    >
      <p className="text-sm text-slate-600">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums ${
          count > 0 ? 'text-slate-900' : 'text-slate-400'
        }`}
      >
        {count}
      </p>
    </Link>
  );
}

function CardHeading({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <Link to={to} className="tap text-xs font-medium text-brand-700 hover:text-brand-900">
        Open →
      </Link>
    </div>
  );
}

/// A number that is only coloured when it is not zero — a red 0 reads as a problem.
function Count({ n, tone }: { n: number; tone: 'success' | 'warning' | 'danger' }) {
  const colour =
    n === 0
      ? 'text-slate-700'
      : tone === 'danger'
        ? 'text-rose-700'
        : tone === 'warning'
          ? 'text-amber-700'
          : 'text-emerald-700';
  return <span className={`font-semibold tabular-nums ${colour}`}>{n}</span>;
}

function Lines({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-700">
      {items.slice(0, SHOWN).map((line) => (
        <li key={line}>{line}</li>
      ))}
      {items.length > SHOWN && (
        <li className="text-xs text-slate-500">and {items.length - SHOWN} more</li>
      )}
    </ul>
  );
}
