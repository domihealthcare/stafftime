import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { addDays, displayName, formatTimeCompact, localDate, startOfWeek } from '../lib/format';
import { useIsManager, useSession } from '../lib/session';
import { timeOffOn } from '../lib/time-off';
import type { Employee, JobRole, Location, PtoRequest, Shift } from '../lib/types';
import { BrandMark } from '../components/Brand';
import { Alert, Spinner } from '../components/ui';

/// "2026-09-28" as a local midnight, not UTC — a week that starts on Monday
/// must not print as Sunday west of Greenwich.
function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The week's rota on paper, for the break-room wall: one page per office,
 * a row per person, a column per day.
 *
 * It prints what staff are meant to rely on, and nothing else: **published**
 * shifts only (drafts are counted on screen so nobody prints a half-built
 * week by accident), no open shifts (only managers see those), and time off
 * as a plain "Off" — never the kind, because the wall is not the place to
 * say who is off sick.
 */
export function RotaPrintPage() {
  const isManager = useIsManager();
  const { employee: me } = useSession();
  const [params, setParams] = useSearchParams();
  const weekStart = useMemo(
    () => startOfWeek(parseDay(params.get('week')) ?? new Date()),
    [params],
  );
  const locationParam = params.get('location') ?? '';
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const dayKeys = days.map((day) => localDate(day));

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [timeOff, setTimeOff] = useState<PtoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listShifts({
        from: weekStart.toISOString(),
        to: addDays(weekStart, 7).toISOString(),
      }),
      api.listEmployees(),
      api.listLocations(),
      api.jobRoles(),
      api.listPto({
        status: 'APPROVED',
        from: localDate(weekStart),
        to: localDate(addDays(weekStart, 6)),
      }),
    ])
      .then(([shiftData, staff, places, roles, off]) => {
        if (cancelled) return;
        setShifts(shiftData);
        setEmployees(staff);
        setLocations(places);
        setJobRoles(roles);
        setTimeOff(off);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the rota.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isManager, weekStart]);

  // The tab title becomes the file name when somebody saves it as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `Rota, week of ${weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
    return () => {
      document.title = previous;
    };
  }, [weekStart]);

  if (!isManager) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert>Only managers can print the rota.</Alert>
      </div>
    );
  }

  const offices = locations.filter(
    (location) => location.isActive !== false && (!locationParam || location.id === locationParam),
  );
  const live = shifts.filter((shift) => shift.status !== 'CANCELLED' && shift.employeeId !== null);
  const published = live.filter((shift) => shift.status === 'PUBLISHED');
  const drafts = live.filter(
    (shift) => shift.status === 'DRAFT' && (!locationParam || shift.locationId === locationParam),
  ).length;
  const roleNames = (personId: string) =>
    jobRoles
      .filter((role) => role.members.some((member) => member.id === personId))
      .map((role) => role.name);

  const goToWeek = (offset: number) => {
    const next = new URLSearchParams(params);
    next.set('week', localDate(addDays(weekStart, offset)));
    setParams(next, { replace: true });
  };
  const pickOffice = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('location', id);
    else next.delete('location');
    setParams(next, { replace: true });
  };

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} – ${addDays(
    weekStart,
    6,
  ).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
  const printedAt = new Date().toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{PRINT_CSS}</style>

      {/* The controls: on screen only, never on paper. */}
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Link
            to="/schedule"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to the schedule
          </Link>
          <button
            type="button"
            onClick={() => goToWeek(-7)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Previous week
          </button>
          <button
            type="button"
            onClick={() => goToWeek(7)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Next week →
          </button>
          <select
            aria-label="Office to print"
            value={locationParam}
            onChange={(event) => pickOffice(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Every office, a page each</option>
            {locations
              .filter((location) => location.isActive !== false)
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
          </select>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Print
          </button>
        </div>
        {drafts > 0 && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <p
              role="status"
              data-testid="print-drafts"
              className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
            >
              {drafts} draft shift{drafts === 1 ? ' is' : 's are'} not on this printout. Only
              published shifts are printed — publish {drafts === 1 ? 'it' : 'them'} on the schedule
              first if {drafts === 1 ? 'it belongs' : 'they belong'} on the wall.
            </p>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl p-4 print:max-w-none print:p-0">
        {error && <Alert>{error}</Alert>}
        {loading ? (
          <div className="p-6">
            <Spinner label="Loading the rota" />
          </div>
        ) : (
          offices.map((office) => {
            const people = employees
              .filter(
                (person) =>
                  person.employmentStatus === 'ACTIVE' || person.employmentStatus === 'ON_LEAVE',
              )
              .filter((person) => {
                const worksHere = published.some(
                  (shift) => shift.employeeId === person.id && shift.locationId === office.id,
                );
                const assignedHere = person.locations.some((a) => a.locationId === office.id);
                const offThisWeek = dayKeys.some(
                  (key) => timeOffOn(timeOff, person.id, key) !== null,
                );
                return worksHere || (assignedHere && offThisWeek);
              })
              .sort(
                (a, b) =>
                  (a.preferredName ?? a.firstName).localeCompare(b.preferredName ?? b.firstName) ||
                  a.lastName.localeCompare(b.lastName),
              );

            return (
              <section
                key={office.id}
                data-testid={`print-page-${office.name}`}
                className="rota-page mb-6 rounded-xl bg-white p-6 shadow-sm print:mb-0 print:rounded-none print:p-0 print:shadow-none"
              >
                <header className="mb-4 flex items-end justify-between gap-4 border-b-2 border-slate-800 pb-2">
                  <div className="flex items-center gap-3">
                    <BrandMark className="h-8 w-auto" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Domi Healthcare · {office.name}
                      </p>
                      <h1 className="text-xl font-bold text-slate-900">Rota: {weekLabel}</h1>
                    </div>
                  </div>
                  <p className="text-right text-xs text-slate-500">
                    Printed {printedAt}
                    {me ? ` by ${displayName(me)}` : ''}
                  </p>
                </header>

                {people.length === 0 ? (
                  <p className="py-8 text-center text-slate-500">
                    Nobody has a published shift at {office.name} this week.
                  </p>
                ) : (
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="w-[18%] border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold"
                        >
                          Name
                        </th>
                        {days.map((day, index) => (
                          <th
                            key={dayKeys[index]}
                            scope="col"
                            className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-semibold"
                          >
                            {day.toLocaleDateString(undefined, { weekday: 'short' })}{' '}
                            <span className="font-normal">
                              {day.toLocaleDateString(undefined, {
                                month: 'numeric',
                                day: 'numeric',
                              })}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((person) => (
                        <tr key={person.id} data-testid={`print-row-${displayName(person)}`}>
                          <th
                            scope="row"
                            className="border border-slate-400 px-2 py-1.5 text-left align-top"
                          >
                            <span className="block font-semibold">{displayName(person)}</span>
                            <span className="block text-xs font-normal text-slate-600">
                              {roleNames(person.id).join(' · ')}
                            </span>
                          </th>
                          {days.map((_, index) => {
                            const key = dayKeys[index];
                            const mine = published
                              .filter(
                                (shift) =>
                                  shift.employeeId === person.id &&
                                  shift.locationId === office.id &&
                                  localDate(new Date(shift.startsAt)) === key,
                              )
                              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                            const off = timeOffOn(timeOff, person.id, key);
                            return (
                              <td
                                key={key}
                                className={`border border-slate-400 px-2 py-1.5 align-top ${off ? 'rota-off' : ''}`}
                              >
                                {off && (
                                  <span className="block font-semibold text-slate-700">
                                    Off{off.isHalfDay ? ' (half day)' : ''}
                                  </span>
                                )}
                                {mine.map((shift) => (
                                  <span key={shift.id} className="block">
                                    <span className="font-semibold tabular-nums">
                                      {formatTimeCompact(shift.startsAt)}–
                                      {formatTimeCompact(shift.endsAt)}
                                    </span>
                                    {(shift.isRemote || shift.jobRole) && (
                                      <span className="block text-xs text-slate-600">
                                        {[shift.jobRole?.name, shift.isRemote ? 'From home' : null]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </span>
                                    )}
                                  </span>
                                ))}
                                {!off && mine.length === 0 && (
                                  <span className="text-slate-300" aria-label="Not on">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <p className="mt-3 text-xs text-slate-500">
                  Published shifts only. The rota can change after this was printed — Domi Staff
                  always has the latest.
                </p>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

/// Landscape, one office to a page, and the hatching on days off kept when
/// printing (browsers drop backgrounds unless asked not to).
const PRINT_CSS = `
@page { size: letter landscape; margin: 0.4in; }
@media print {
  .rota-page { break-after: page; }
  .rota-page:last-child { break-after: auto; }
  tr, td, th { break-inside: avoid; }
}
.rota-off {
  background-image: repeating-linear-gradient(135deg, rgba(100,116,139,0.18) 0 5px, transparent 5px 10px);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
`;
