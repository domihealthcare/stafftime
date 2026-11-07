import { useMemo } from 'react';
import { Card } from '../ui';
import { addCalendarDays } from '../../lib/dates';
import { formatCalendarDate } from '../../lib/format';
import {
  NOBODY_COLOUR,
  clockChangeNote,
  colourFor,
  dayWords,
  hourCells,
  sourceWords,
} from '../../lib/call-routing';
import { useIsPhone } from '../../lib/use-is-phone';
import type { OnCallPerson, OnCallRoutingView } from '../../lib/types';

function initials(person: OnCallPerson): string {
  return `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase();
}

/**
 * The next days, an hour at a time on New Jersey's clock, coloured by who is
 * on call. A laptop gets a grid; a phone a list per day. Pressing a day opens
 * "Add a cover" for it.
 */
export function NextSixtyDays({
  view,
  onPickDate,
}: {
  view: OnCallRoutingView;
  onPickDate: (date: string) => void;
}) {
  const isPhone = useIsPhone();
  const people = useMemo(() => {
    const map = new Map<string, OnCallPerson>();
    for (const person of [...view.providers, ...view.people]) map.set(person.id, person);
    return map;
  }, [view]);
  const order = useMemo(() => [...people.keys()], [people]);
  const nameOf = (id: string | null) => (id ? (people.get(id)?.name ?? 'Unknown') : 'Nobody');
  const colour = (id: string | null) => (id ? colourFor(order.indexOf(id)) : NOBODY_COLOUR);

  const dates = useMemo(
    () => Array.from({ length: view.days }, (_, index) => addCalendarDays(view.from, index)),
    [view.from, view.days],
  );
  const rows = useMemo(
    () => dates.map((date) => ({ date, cells: hourCells(date, view.segments) })),
    [dates, view.segments],
  );

  const legend = (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="Key">
      {view.providers.map((p) => (
        <li key={p.id} className="flex items-center gap-1.5">
          <span
            className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 text-[10px] font-semibold ${colour(p.id).bg} ${colour(p.id).text}`}
          >
            {initials(p)}
          </span>
          {p.name}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 text-[10px] ${NOBODY_COLOUR.bg} ${NOBODY_COLOUR.text}`}
        >
          -
        </span>
        Nobody
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-5 w-7 rounded bg-white ring-2 ring-inset ring-slate-900" />A
        cover (outlined)
      </li>
    </ul>
  );

  return (
    <section aria-labelledby="next-sixty" className="space-y-3">
      <h2 id="next-sixty" className="text-lg font-semibold text-slate-900">
        Next 60 days
      </h2>
      <p className="text-sm text-slate-600">
        Who the line rings, hour by hour, on New Jersey time. Press a day to add a cover.
      </p>
      {legend}
      {isPhone ? (
        <ul className="space-y-1.5">
          {rows.map(({ date, cells }) => {
            const note = clockChangeNote(cells);
            return (
              <li key={date}>
                <button
                  type="button"
                  onClick={() => onPickDate(date)}
                  className="w-full rounded-lg bg-white p-2 text-left text-sm ring-1 ring-inset ring-slate-200 hover:ring-brand-400"
                >
                  <span className="font-medium text-slate-900">
                    {formatCalendarDate(date, { year: false })}:
                  </span>{' '}
                  {dayWords(cells, nameOf)}
                  {cells.some((c) => c.segment?.source === 'COVER') && (
                    <span className="ml-1 text-xs font-medium text-slate-700">(has a cover)</span>
                  )}
                  {note && <span className="block text-xs text-slate-500">{note}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card className="overflow-hidden p-2" testId="routing-grid">
          <div className="flex items-end gap-2 pb-1">
            <div className="w-28 shrink-0" />
            <div
              className="grid flex-1 text-[10px] text-slate-500"
              style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
              aria-hidden="true"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour}>
                  {hour % 3 === 0
                    ? `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`
                    : ''}
                </span>
              ))}
            </div>
          </div>
          <ul className="space-y-0.5">
            {rows.map(({ date, cells }) => {
              const note = clockChangeNote(cells);
              return (
                <li
                  key={date}
                  className="flex items-center gap-2"
                  data-testid={`routing-day-${date}`}
                >
                  <button
                    type="button"
                    onClick={() => onPickDate(date)}
                    className="w-28 shrink-0 rounded px-1 py-0.5 text-left text-xs font-medium text-slate-800 hover:bg-slate-100"
                    title={note ?? undefined}
                  >
                    {formatCalendarDate(date, { year: false })}
                    {note ? ' *' : ''}
                  </button>
                  <div
                    className="grid flex-1 gap-px"
                    style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
                  >
                    {cells.map((cell) => {
                      const segment = cell.segment;
                      const person = segment?.employeeId ? people.get(segment.employeeId) : null;
                      const c = colour(segment?.employeeId ?? null);
                      const backup = segment?.backupEmployeeId
                        ? nameOf(segment.backupEmployeeId)
                        : null;
                      const words = `${formatCalendarDate(date, { year: false })}, ${cell.label}: ${nameOf(segment?.employeeId ?? null)}${backup ? `, backup ${backup}` : ''}. ${sourceWords(segment?.source ?? 'NONE')}${segment?.source === 'COVER' ? ' (a cover)' : ''}.`;
                      return (
                        <button
                          type="button"
                          key={cell.startsAt}
                          onClick={() => onPickDate(date)}
                          title={words}
                          aria-label={words}
                          className={`h-6 truncate text-[9px] font-semibold leading-6 hover:brightness-95 ${c.bg} ${c.text} ${
                            segment?.source === 'COVER' ? 'ring-2 ring-inset ring-slate-900' : ''
                          }`}
                        >
                          {person ? initials(person) : ''}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            * A day the clocks change has 23 or 25 hours; point at its date for the note. Hover or
            focus an hour to see the provider, the backup and why.
          </p>
        </Card>
      )}
    </section>
  );
}
