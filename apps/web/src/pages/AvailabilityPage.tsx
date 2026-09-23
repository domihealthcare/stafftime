import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, PageHeading, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { displayName, formatCalendarDate, localDate } from '../lib/format';
import { useIsManager } from '../lib/session';
import type {
  MyAvailability,
  TeamAvailability,
  UnavailabilityKind,
  UnavailabilityRule,
} from '../lib/types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * When somebody cannot work — every week, or on one date.
 *
 * Staff set their own. The one rule is that a published week is fixed: a
 * change reaches the first week whose rota is not out yet, and the screen says
 * which week that is before anybody tries.
 */
export function AvailabilityPage() {
  const isManager = useIsManager();
  const [mine, setMine] = useState<MyAvailability | null>(null);
  const [team, setTeam] = useState<TeamAvailability[]>([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [own, everyone] = await Promise.all([
        api.availability(),
        isManager ? api.teamAvailability() : Promise.resolve([]),
      ]);
      setMine(own);
      setTeam(everyone);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load availability.');
    }
  }, [isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!mine && !error) return <Spinner label="Loading availability" />;

  const weekly = mine?.rules.filter((rule) => rule.kind === 'WEEKLY') ?? [];
  const oneOff = mine?.rules.filter((rule) => rule.kind === 'ONE_OFF') ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/schedule" className="text-sm font-medium text-brand-700 hover:text-brand-900">
        ← Schedule
      </Link>
      <div className="mt-3">
        <PageHeading
          title="When you can’t work"
          subtitle="Tell your managers the times you can’t work — every week, or on a particular date. For whole days away, ask for time off instead."
        />
      </div>

      {mine && (
        <div className="mb-4">
          <Alert tone="info">
            {mine.firstOpenDate > localDate(new Date()) ? (
              <>
                The schedule is published up to{' '}
                <strong>{formatCalendarDate(dayBefore(mine.firstOpenDate))}</strong>, so changes
                here count from <strong>{formatCalendarDate(mine.firstOpenDate)}</strong>. For
                anything sooner, talk to a manager.
              </>
            ) : (
              <>
                Nothing ahead is published yet, so changes count straight away. Once a week’s
                schedule is published, that week is fixed.
              </>
            )}
          </Alert>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-6">
        {adding && mine ? (
          <RuleForm
            firstOpenDate={mine.firstOpenDate}
            onSaved={() => {
              setAdding(false);
              setNotice(null);
              void load();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Add a time you can’t work
          </button>
        )}
      </div>

      <RuleList
        title="Every week"
        rules={weekly}
        empty="Nothing every week."
        onRemoved={(endsAfter) => {
          setNotice(
            endsAfter
              ? `Removed. The weeks already published up to ${formatCalendarDate(endsAfter)} stay as they are.`
              : 'Removed.',
          );
          void load();
        }}
        onError={setError}
      />
      <RuleList
        title="Particular dates"
        rules={oneOff}
        empty="No particular dates."
        onRemoved={() => {
          setNotice('Removed.');
          void load();
        }}
        onError={setError}
      />

      {isManager && <TeamList team={team} />}
    </div>
  );
}

function RuleList({
  title,
  rules,
  empty,
  onRemoved,
  onError,
}: {
  title: string;
  rules: UnavailabilityRule[];
  empty: string;
  onRemoved: (endsAfter: string | null) => void;
  onError: (message: string) => void;
}) {
  return (
    <section aria-label={title} className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
      {rules.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} onRemoved={onRemoved} onError={onError} />
          ))}
        </div>
      )}
    </section>
  );
}

function RuleRow({
  rule,
  onRemoved,
  onError,
}: {
  rule: UnavailabilityRule;
  onRemoved: (endsAfter: string | null) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Card className="p-3" testId={`rule-${rule.description}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {rule.description.replace(/^Not available (on )?/, '')}
          </p>
          <p className="text-xs text-slate-500">
            {rule.kind === 'WEEKLY' && `From ${formatCalendarDate(rule.effectiveFrom)}`}
            {rule.kind === 'WEEKLY' &&
              rule.effectiveUntil &&
              ` until ${formatCalendarDate(rule.effectiveUntil)}`}
            {rule.note && `${rule.kind === 'WEEKLY' ? ' · ' : ''}${rule.note}`}
          </p>
        </div>
        {rule.locked ? (
          <Badge>Published — ask a manager</Badge>
        ) : rule.effectiveUntil ? (
          <Badge>Ending</Badge>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api.removeUnavailability(rule.id);
                onRemoved(result.endsAfter);
              } catch (cause) {
                onError(cause instanceof ApiError ? cause.message : 'Could not remove that.');
              } finally {
                setBusy(false);
              }
            }}
            className="text-xs font-medium text-slate-500 hover:text-rose-700"
          >
            Remove
          </button>
        )}
      </div>
    </Card>
  );
}

function RuleForm({
  firstOpenDate,
  onSaved,
  onCancel,
}: {
  firstOpenDate: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<UnavailabilityKind>('WEEKLY');
  const [weekday, setWeekday] = useState(1);
  const [date, setDate] = useState(firstOpenDate);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('21:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.addUnavailability({
        kind,
        ...(kind === 'WEEKLY' ? { weekday } : { date }),
        ...(allDay ? {} : { startTime, endTime }),
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex gap-1" role="group" aria-label="How often">
        {(
          [
            ['WEEKLY', 'Every week'],
            ['ONE_OFF', 'One date'],
          ] as [UnavailabilityKind, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              kind === value ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kind === 'WEEKLY' ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Day</span>
            <select
              aria-label="Day"
              value={weekday}
              onChange={(event) => setWeekday(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            >
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Date</span>
            <input
              aria-label="Date"
              type="date"
              min={firstOpenDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
        )}

        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <span className="font-medium text-slate-700">All day</span>
        </label>

        {!allDay && (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">From</span>
              <input
                aria-label="From"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Until</span>
              <input
                aria-label="Until"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>
          </>
        )}

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            Why <span className="font-normal text-slate-400">(optional — managers see this)</span>
          </span>
          <input
            aria-label="Why"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            placeholder="School pick-up"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      {kind === 'WEEKLY' && (
        <p className="mt-3 text-xs text-slate-500">
          Counts from {formatCalendarDate(firstOpenDate)} — the weeks before that are already
          published.
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || (kind === 'ONE_OFF' && date === '')}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}

/// Everybody's, for the manager building the rota. Read-only: it is each
/// person's statement about their own time.
function TeamList({ team }: { team: TeamAvailability[] }) {
  const withRules = team.filter((person) => person.rules.length > 0);
  return (
    <section aria-label="The team" className="mt-8">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
        The team
      </h2>
      <p className="mb-2 text-sm text-slate-600">
        What everyone has said they can’t work. The scheduler warns when a shift lands on one of
        these.
      </p>
      {withRules.length === 0 ? (
        <EmptyState>Nobody has said they can’t work any particular time.</EmptyState>
      ) : (
        <div className="space-y-2">
          {withRules.map((person) => (
            <Card key={person.id} className="p-3" testId={`team-${displayName(person)}`}>
              <p className="font-medium text-slate-900">{displayName(person)}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                {person.rules.map((rule) => (
                  <li key={rule.id}>
                    {rule.description.replace(/^Not available (on )?/, '')}
                    {rule.note && <span className="text-slate-500"> — {rule.note}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function dayBefore(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
