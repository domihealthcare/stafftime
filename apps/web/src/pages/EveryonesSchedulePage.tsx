import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api';
import {
  addDays,
  displayName,
  formatTimeCompact,
  localDate,
  parseDay,
  startOfMonth,
  startOfWeek,
} from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import { useT } from '../lib/i18n';
import type { EveryonesSchedule } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { ScheduleTabs } from '../components/ScheduleTabs';
import { Alert, EmptyState, PageHeading, Spinner, buttonClass, inputClass } from '../components/ui';

type Shift = EveryonesSchedule['shifts'][number];

/**
 * Everybody's published shifts, read-only (October 2026, Dominguez: the
 * person who posts the schedule notices needs to see the whole rota without
 * being able to change it). The week is a row per person and a column per day,
 * the month a list of days; both show what the printed rota shows and no
 * more: published shifts, no open shifts, and time off as a bare "Off".
 */
export function EveryonesSchedulePage() {
  const t = useT();
  const isManager = useIsManager();
  const { employee: me } = useSession();
  const allowed = isManager || me?.canSeeEveryonesSchedule === true;
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'month' ? 'month' : 'week';
  const anchor = useMemo(() => parseDay(params.get('day')) ?? new Date(), [params]);
  const officeId = params.get('office') ?? '';

  const first = view === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const last = view === 'week' ? addDays(first, 6) : addDays(startOfMonth(addDays(first, 32)), -1);
  const dayCount = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, index) => addDays(first, index)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [first.getTime(), dayCount],
  );

  const [data, setData] = useState<EveryonesSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    api
      .scheduleView(first.toISOString(), addDays(last, 1).toISOString())
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not load the schedule.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, first.getTime(), last.getTime()]);

  const change = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const step = (direction: -1 | 1) => {
    const moved =
      view === 'week'
        ? addDays(first, 7 * direction)
        : new Date(first.getFullYear(), first.getMonth() + direction, 1);
    change({ day: localDate(moved) });
  };

  if (!allowed) {
    return (
      <div className="max-w-xl">
        <PageHeading title={t('Everyone’s schedule')} />
        <Alert>{t('The whole schedule is for the people an admin has chosen.')}</Alert>
      </div>
    );
  }

  const locationName = (id: string) => data?.locations.find((place) => place.id === id)?.name ?? '';
  const shortPlace = (shift: Shift) =>
    shift.isRemote ? t('Home') : initials(locationName(shift.locationId));
  const shifts = (data?.shifts ?? []).filter((shift) => !officeId || shift.locationId === officeId);
  const byPerson = new Map<string, Shift[]>();
  for (const shift of shifts) {
    byPerson.set(shift.employeeId, [...(byPerson.get(shift.employeeId) ?? []), shift]);
  }
  const dayOf = (shift: Shift) => localDate(new Date(shift.startsAt));
  const isOff = (personId: string, day: string) =>
    (data?.off ?? []).some(
      (row) => row.employeeId === personId && row.startDate <= day && day <= row.endDate,
    );
  const people = (data?.people ?? []).filter((person) => {
    if (!officeId) return true;
    return person.locationIds.includes(officeId) || byPerson.has(person.id);
  });
  const label =
    view === 'week'
      ? `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayKey = localDate(new Date());
  const timeOf = (shift: Shift) =>
    `${formatTimeCompact(shift.startsAt)}-${formatTimeCompact(shift.endsAt)}`;

  return (
    <div className="mx-auto max-w-6xl" data-testid="everyones-schedule">
      <PageHeading
        title={t('Everyone’s schedule')}
        subtitle={t(
          'Everybody’s published shifts. You can look but not change anything. Time off shows as Off.',
        )}
      />
      <ScheduleTabs />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(['week', 'month'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={view === choice}
              onClick={() => change({ view: choice === 'week' ? null : choice })}
              className={`rounded-md px-3 py-1 font-medium ${
                view === choice ? 'bg-brand-50 text-brand-800' : 'text-slate-600'
              }`}
            >
              {choice === 'week' ? t('Week') : t('Month')}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => step(-1)} className={buttonClass('secondary', 'sm')}>
          {t('Previous')}
        </button>
        <button
          type="button"
          onClick={() => change({ day: null })}
          className={buttonClass('secondary', 'sm')}
        >
          {view === 'week' ? t('This week') : t('This month')}
        </button>
        <button type="button" onClick={() => step(1)} className={buttonClass('secondary', 'sm')}>
          {t('Next')}
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          {t('Office')}
          <select
            value={officeId}
            onChange={(event) => change({ office: event.target.value || null })}
            className={inputClass}
          >
            <option value="">{t('Both offices')}</option>
            {(data?.locations ?? []).map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-900" aria-live="polite">
        {label}
      </h2>

      {error && <Alert>{error}</Alert>}
      {loading && !data && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {data &&
        view === 'week' &&
        (people.length === 0 ? (
          <EmptyState>{t('Nobody is on the schedule.')}</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2">{t('Name')}</th>
                  {days.map((day) => (
                    <th
                      key={day.getTime()}
                      className={`px-2 py-2 ${localDate(day) === todayKey ? 'text-brand-800' : ''}`}
                    >
                      {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr
                    key={person.id}
                    className="border-t border-slate-200 align-top odd:bg-white even:bg-slate-50/60"
                  >
                    <th scope="row" className="px-3 py-2 text-left font-medium text-slate-800">
                      <span className="flex items-center gap-2">
                        <Avatar person={person} size="sm" />
                        <span>
                          {displayName(person)}
                          <span className="block text-xs font-normal text-slate-500">
                            {person.jobRoles.map((role) => role.name).join(', ')}
                          </span>
                        </span>
                      </span>
                    </th>
                    {days.map((day) => {
                      const key = localDate(day);
                      const here = (byPerson.get(person.id) ?? []).filter(
                        (shift) => dayOf(shift) === key,
                      );
                      return (
                        <td key={key} className="px-2 py-2">
                          {isOff(person.id, key) && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                              {t('Off')}
                            </span>
                          )}
                          {here.map((shift) => (
                            <span
                              key={shift.id}
                              className="mb-1 block rounded bg-brand-50 px-1.5 py-0.5 text-xs text-slate-800"
                            >
                              {timeOf(shift)}{' '}
                              <span className="text-slate-500">{shortPlace(shift)}</span>
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {data && view === 'month' && (
        <div className="space-y-2">
          {days.map((day) => {
            const key = localDate(day);
            const here = shifts.filter((shift) => dayOf(shift) === key);
            const off = people.filter((person) => isOff(person.id, key));
            if (here.length === 0 && off.length === 0) return null;
            const nameOf = (id: string) => {
              const person = data.people.find((candidate) => candidate.id === id);
              return person ? displayName(person) : '';
            };
            return (
              <section
                key={key}
                className={`rounded-lg border bg-white p-3 ${key === todayKey ? 'border-brand-600' : 'border-slate-200'}`}
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {day.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                  {here.map((shift) => (
                    <li key={shift.id}>
                      <span className="font-medium">{nameOf(shift.employeeId)}</span>{' '}
                      {timeOf(shift)} <span className="text-slate-500">{shortPlace(shift)}</span>
                    </li>
                  ))}
                  {off.map((person) => (
                    <li key={`off-${person.id}`} className="text-slate-500">
                      {displayName(person)}: {t('Off')}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {shifts.length === 0 && <EmptyState>{t('Nothing is published this month.')}</EmptyState>}
        </div>
      )}
    </div>
  );
}

/// "North Bergen" as "NB", "West New York" as "WNY".
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
