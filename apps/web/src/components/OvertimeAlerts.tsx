import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCalendarDate } from '../lib/format';
import type { OvertimeCheck, OwnOvertimeWeek } from '../lib/types';
import type { ConfirmOptions } from './ConfirmDialog';

/// One shift, about to be saved for one person.
export interface ProposedShift {
  employeeId: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  /// When assigning or moving an existing shift, so it is not counted twice.
  shiftId?: string;
}

const round1 = (hours: number) => Math.round(hours * 10) / 10;
const hoursWord = (hours: number) => `${round1(hours)} ${round1(hours) === 1 ? 'hour' : 'hours'}`;

/**
 * Where somebody's week would land with this shift in it, asked while the
 * manager is still filling the form in — so the warning is there before Save
 * is pressed, not after. Null while there is nothing to ask or no answer yet;
 * a failed check shows nothing rather than an error, since the save itself
 * checks again.
 */
export function useOvertimeCheck(proposed: ProposedShift | null): OvertimeCheck | null {
  const [check, setCheck] = useState<OvertimeCheck | null>(null);
  const key = proposed ? JSON.stringify(proposed) : '';

  useEffect(() => {
    setCheck(null);
    if (!key) return;
    const query = JSON.parse(key) as ProposedShift;
    if (new Date(query.endsAt).getTime() <= new Date(query.startsAt).getTime()) return;
    let cancelled = false;
    // A short pause, so typing a time does not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      api
        .overtimeCheck(query)
        .then((result) => !cancelled && setCheck(result))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return check;
}

/// The warning inside the form: red past the line, amber close to it.
export function OvertimePreview({ check, name }: { check: OvertimeCheck | null; name: string }) {
  if (!check || !check.hourly || check.level === 'ok') return null;
  const week = formatCalendarDate(check.weekStart, { year: false });

  if (check.level === 'over') {
    return (
      <div
        data-testid="overtime-preview"
        className="rounded-lg border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-inset ring-rose-200"
      >
        <p className="font-semibold">⚠ This puts {name} into overtime</p>
        <p className="mt-0.5">
          {hoursWord(check.hoursAfter)} in the week of {week} —{' '}
          {hoursWord(check.hoursAfter - check.thresholdHours)} past the {check.thresholdHours}
          -hour line.
        </p>
      </div>
    );
  }

  const left = round1(check.thresholdHours - check.hoursAfter);
  return (
    <div
      data-testid="overtime-preview"
      className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
    >
      <p className="font-semibold">Close to overtime</p>
      <p className="mt-0.5">
        This brings {name} to {round1(check.hoursAfter)} of {check.thresholdHours} hours in the week
        of {week}.{' '}
        {left > 0
          ? `${hoursWord(left)} left before overtime.`
          : 'Any more time that week, even a late finish, is overtime.'}
      </p>
    </div>
  );
}

/**
 * Asked at the moment of saving, from a fresh check rather than whatever the
 * form last showed: "this puts them into overtime — schedule it anyway?"
 *
 * A warning with a way through, never a refusal. The rota is the manager's;
 * what the app must not do is let overtime go in without anyone noticing.
 */
export async function confirmOvertime(
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  proposed: ProposedShift,
  name: string,
): Promise<boolean> {
  const check = await api.overtimeCheck(proposed).catch(() => null);
  if (!check || !check.hourly || check.level !== 'over') return true;
  return confirm({
    title: `Schedule ${name} into overtime?`,
    body: (
      <>
        <p>
          This makes {hoursWord(check.hoursAfter)} in the week of{' '}
          {formatCalendarDate(check.weekStart, { year: false })} —{' '}
          {hoursWord(check.hoursAfter - check.thresholdHours)} past the {check.thresholdHours}-hour
          overtime line.
        </p>
        <p className="mt-1">If it is published, {name} is told too.</p>
      </>
    ),
    confirmLabel: 'Yes, schedule it',
    cancelLabel: 'Go back',
  });
}

/**
 * Your own coming weeks that your published rota puts past the overtime line
 * — on the home screen and the schedule, so nobody finds out from their
 * payslip. Only past it: "close" is the manager's warning while scheduling,
 * not something to carry once the rota is agreed.
 */
export function MyOvertimeNotice({ weeks: given }: { weeks?: OwnOvertimeWeek[] } = {}) {
  const [fetched, setFetched] = useState<OwnOvertimeWeek[]>([]);
  const weeks = given ?? fetched;

  useEffect(() => {
    // A screen that already has them (the schedule) passes them in.
    if (given) return;
    let cancelled = false;
    api
      .myOvertime()
      .then((result) => !cancelled && setFetched(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [given]);

  if (weeks.length === 0) return null;

  return (
    <section
      aria-label="Your overtime"
      data-testid="my-overtime"
      className="rounded-xl border-l-4 border-rose-600 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm ring-1 ring-inset ring-rose-200"
    >
      <p className="font-semibold">⚠ Your schedule puts you into overtime</p>
      <ul className="mt-1 space-y-0.5">
        {weeks.map((week) => (
          <li key={week.weekStart}>
            Week of {formatCalendarDate(week.weekStart, { year: false })}:{' '}
            <span className="font-semibold">{hoursWord(week.scheduledHours)}</span> —{' '}
            {hoursWord(week.overtimeHours)} past the {week.thresholdHours}-hour line.
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-rose-800">
        If that is not what you agreed, talk to your manager before the week starts.
      </p>
    </section>
  );
}
