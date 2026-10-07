import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { KIND_STYLE } from '../lib/calendar-kinds';
import { formatTimeCompact, localDate } from '../lib/format';
import { PTO_TYPE_LABELS, timeOffOn } from '../lib/time-off';
import type { PracticeEvent, PtoRequest, Shift } from '../lib/types';
import { officeShort } from '../lib/calendar-kinds';
import { LunchIcon } from './LunchIcon';

/// Somebody's own schedule for the Calendar's "My shifts": their published
/// shifts and approved time off.
export interface MySchedule {
  shifts: Shift[];
  timeOff: PtoRequest[];
}

export const NO_SCHEDULE: MySchedule = { shifts: [], timeOff: [] };

/**
 * Your own published shifts and approved time off between two days. Drafts
 * are a manager's working copy, so not even a manager's own are shown; a
 * manager's time-off list is everybody's, so it is narrowed to them.
 */
export async function loadMySchedule(
  employeeId: string,
  from: Date,
  through: Date,
): Promise<MySchedule> {
  const [shifts, timeOff] = await Promise.all([
    api.listShifts({
      from: from.toISOString(),
      to: new Date(through.getTime() + 86_400_000).toISOString(),
      employeeId,
    }),
    api.listPto({ from: localDate(from), to: localDate(through), status: 'APPROVED' }),
  ]);
  return {
    shifts: shifts
      .filter((shift) => shift.employeeId === employeeId && shift.status === 'PUBLISHED')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    timeOff: timeOff.filter((request) => request.employeeId === employeeId),
  };
}

/// What is yours on a day: its shifts, and the time off covering it.
export function myDay(schedule: MySchedule, employeeId: string | undefined, day: string) {
  return {
    shifts: schedule.shifts.filter((shift) => localDate(new Date(shift.startsAt)) === day),
    off: timeOffOn(schedule.timeOff, employeeId, day),
  };
}

/// "9am–5pm · NB", "9am–1pm · Home".
export function shiftLine(shift: Shift): string {
  const place = shift.isRemote ? 'Home' : shift.location ? officeShort(shift.location.name) : '';
  return `${formatTimeCompact(shift.startsAt)}–${formatTimeCompact(shift.endsAt)}${
    place ? ` · ${place}` : ''
  }`;
}

/// "Off · PTO", "Half day off · Sick".
export function offLine(request: PtoRequest): string {
  return `${request.isHalfDay ? 'Half day off' : 'Off'} · ${PTO_TYPE_LABELS[request.type]}`;
}

/**
 * A day's own shifts and time off on the Calendar. A shift opens its week on
 * the Schedule, where it can be read in full, and says whether there is a rep
 * lunch, as everywhere else a shift is shown. On a phone's month, the icon
 * alone.
 */
export function MyDayChips({
  schedule,
  employeeId,
  day,
  events,
  compact = false,
}: {
  schedule: MySchedule;
  employeeId: string | undefined;
  day: string;
  events: PracticeEvent[];
  compact?: boolean;
}) {
  const { shifts, off } = myDay(schedule, employeeId, day);
  const style = KIND_STYLE.MY_SHIFT;
  return (
    <>
      {off && (
        <span
          data-testid="my-time-off"
          className="block truncate rounded-md bg-slate-100 px-1.5 py-1 text-xs font-medium leading-tight text-slate-700 ring-1 ring-inset ring-slate-300"
        >
          <span aria-hidden="true">🌴</span>
          <span className={compact ? 'sr-only' : undefined}> {offLine(off)}</span>
        </span>
      )}
      {shifts.map((shift) => (
        <Link
          key={shift.id}
          to={`/schedule?week=${day}`}
          data-testid="my-shift"
          aria-label={`Your shift, ${shiftLine(shift)}`}
          className={`flex items-center gap-1 truncate rounded-md px-1.5 py-1 text-xs font-semibold leading-tight ring-1 ring-inset ${style.chip}`}
        >
          <span aria-hidden="true">{style.emoji}</span>
          {!compact && <span className="truncate">{shiftLine(shift)}</span>}
          {!compact && <LunchIcon shift={shift} events={events} />}
        </Link>
      ))}
    </>
  );
}
