import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogoForPrint } from '../components/Brand';
import { eventsOnDay, eventTimeLabel, shortTitle } from '../components/PracticeEvents';
import { Alert, Spinner, buttonClass } from '../components/ui';
import { api } from '../lib/api';
import { CALENDAR_KINDS, KIND_STYLE, officeShort, type CalendarKind } from '../lib/calendar-kinds';
import {
  addDays,
  addMonths,
  displayName,
  localDate,
  monthGrid,
  parseDay,
  startOfMonth,
} from '../lib/format';
import { useSession } from '../lib/session';
import type { Location, PracticeEvent } from '../lib/types';

/// Each kind's ink on paper: strong enough to read in black and white too.
const PRINT_INK: Record<CalendarKind, string> = {
  CLOSURE: 'text-slate-900 font-bold',
  HOLIDAY: 'text-amber-800 font-semibold',
  PAY_DAY: 'text-emerald-800 font-semibold',
  DIAGNOSTIC: 'text-sky-800 font-semibold',
  REP_LUNCH: 'text-rose-800',
  EVENT: 'text-indigo-800',
};

/**
 * The practice calendar on paper (October 2026, Dominguez) — the month the
 * practice used to keep by hand, for the wall: one landscape page, Sunday
 * first, each day with its diagnostics, rep lunches, holidays, closures,
 * meetings and pay days. It prints what the Calendar shows (`?kinds=` and
 * `?office=`, passed from there), and only what staff may see: a rep lunch
 * is its rep's name, never their phone or the managers' notes.
 */
export function CalendarPrintPage() {
  const { employee: me } = useSession();
  const [params, setParams] = useSearchParams();
  const monthStart = useMemo(
    () => startOfMonth(parseDay(params.get('month')) ?? new Date()),
    [params],
  );
  const kinds = useMemo(() => {
    const asked = (params.get('kinds') ?? '')
      .split(',')
      .filter((kind): kind is CalendarKind => CALENDAR_KINDS.includes(kind as CalendarKind));
    return asked.length > 0 ? asked : CALENDAR_KINDS;
  }, [params]);
  const office = params.get('office') ?? '';
  const days = useMemo(() => monthGrid(monthStart), [monthStart]);

  const [events, setEvents] = useState<PracticeEvent[]>([]);
  const [payDays, setPayDays] = useState<string[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const first = days[0];
    const last = days[days.length - 1];
    Promise.all([
      api.events(first.toISOString(), addDays(last, 1).toISOString()),
      api.payDays(localDate(first), localDate(last)),
      api.listLocations(),
    ])
      .then(([found, paid, offices]) => {
        if (cancelled) return;
        setEvents(found);
        setPayDays(paid.payDays);
        setLocations(offices);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the month.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const monthName = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  // The tab title becomes the file name when somebody saves it as a PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `Calendar, ${monthName}`;
    return () => {
      document.title = previous;
    };
  }, [monthName]);

  const shown = events.filter((event) => {
    if (!kinds.includes(event.kind)) return false;
    if (!office) return true;
    if (event.kind === 'DIAGNOSTIC' || event.kind === 'REP_LUNCH') {
      return event.atLocation?.id === office;
    }
    if (event.kind === 'CLOSURE' && event.audience === 'LOCATION') {
      return event.location?.id === office;
    }
    return true;
  });
  const paid = kinds.includes('PAY_DAY') ? payDays : [];
  const officeName = locations.find((location) => location.id === office)?.name;

  const goToMonth = (offset: number) => {
    const next = new URLSearchParams(params);
    next.set('month', localDate(addMonths(monthStart, offset)));
    setParams(next, { replace: true });
  };
  const back = new URLSearchParams({ month: localDate(monthStart) });

  const printedAt = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{PRINT_CSS}</style>

      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Link
            to={`/schedule/calendar?${back.toString()}`}
            className={buttonClass('secondary', 'sm')}
          >
            ← Back to the calendar
          </Link>
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className={buttonClass('secondary', 'sm')}
          >
            ← Previous month
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className={buttonClass('secondary', 'sm')}
          >
            Next month →
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonClass('primary', 'md')}
          >
            Print
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 print:max-w-none print:p-0">
        {error && <Alert>{error}</Alert>}
        {loading ? (
          <div className="p-6">
            <Spinner label="Loading the month" />
          </div>
        ) : (
          <section
            data-testid="print-month"
            className="month-page rounded-xl bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none"
          >
            <header className="mb-3 flex items-end justify-between gap-4">
              <BrandLogoForPrint className="h-14 w-auto" />
              <h1 className="text-center text-4xl font-black uppercase tracking-wide text-slate-900">
                {monthName}
              </h1>
              <p className="text-right text-xs text-slate-500">
                {officeName ?? 'Both offices'}
                <br />
                Printed {printedAt}
                {me ? ` by ${displayName(me)}` : ''}
              </p>
            </header>

            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {days.slice(0, 7).map((day) => (
                    <th
                      key={day.getDay()}
                      scope="col"
                      className="border border-slate-800 py-1 text-center text-sm font-semibold uppercase"
                    >
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: days.length / 7 }, (_, week) => (
                  <tr key={week}>
                    {days.slice(week * 7, week * 7 + 7).map((day) => {
                      const key = localDate(day);
                      const inMonth = day.getMonth() === monthStart.getMonth();
                      const dayEvents = inMonth ? eventsOnDay(shown, key) : [];
                      // The office a day's diagnostics are at, top right, as on the paper.
                      const at = [
                        ...new Set(
                          dayEvents
                            .filter((event) => event.kind === 'DIAGNOSTIC' && event.atLocation)
                            .map((event) => officeShort(event.atLocation!.name)),
                        ),
                      ];
                      return (
                        <td
                          key={key}
                          data-testid={`print-day-${key}`}
                          className="month-cell border border-slate-800 p-1 align-top"
                        >
                          {inMonth && (
                            <>
                              <div className="flex items-start justify-between">
                                <span className="text-lg font-bold leading-none">
                                  {day.getDate()}
                                </span>
                                {at.length > 0 && (
                                  <span className="text-xs font-semibold">{at.join(' · ')}</span>
                                )}
                              </div>
                              <ul className="mt-0.5 space-y-0.5 text-[11px] leading-tight">
                                {paid.includes(key) && (
                                  <li className={PRINT_INK.PAY_DAY}>💵 Pay day</li>
                                )}
                                {dayEvents.map((event) => (
                                  <li key={event.id} className={PRINT_INK[event.kind]}>
                                    {printLine(event, key)}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
              {kinds.map((kind) => (
                <span key={kind} className={PRINT_INK[kind]}>
                  {KIND_STYLE[kind].emoji} {KIND_STYLE[kind].label}
                </span>
              ))}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

/// One entry, short enough for a cell: "US + ECHO 8am–2pm", "🍽 Jane Smith
/// 12:30pm · NB", "Closed all day: Christmas Day".
function printLine(event: PracticeEvent, day: string): string {
  const time = eventTimeLabel(event, day);
  switch (event.kind) {
    case 'DIAGNOSTIC':
      return `${event.title} ${time}`;
    case 'REP_LUNCH':
      return `🍽 ${shortTitle(event)} ${time}${
        event.atLocation ? ` · ${officeShort(event.atLocation.name)}` : ''
      }`;
    case 'HOLIDAY':
      return event.title;
    case 'CLOSURE':
      return `🔒 ${time}: ${event.title}${
        event.audience === 'LOCATION' && event.location
          ? ` (${officeShort(event.location.name)})`
          : ''
      }`;
    default:
      return `${event.title}${event.allDay ? '' : ` ${time}`}`;
  }
}

const PRINT_CSS = `
@page { size: letter landscape; margin: 0.35in; }
.month-cell { height: 6.2rem; }
@media print {
  .month-cell { height: 1.18in; }
  .month-page { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr, td { break-inside: avoid; }
}
`;
