import { formatCalendarDate } from '../lib/format';
import { firstDates, isEveryWeek, WEEKS_OF_MONTH, type RepeatWeeks } from '../lib/repeat-pattern';

/// The select's value for "certain weeks of the month".
const BY_MONTH = 'month';

/**
 * Which weeks a repeating shift is on (Dominguez, October 2026: "repeat
 * shifts on like 1st Saturday of the month"): every week, every 2–4 weeks,
 * or certain weeks of the month. Sits under the weekday toggles, and shows
 * the first few dates it makes so "every other week" and "the last Friday"
 * are never a guess.
 */
export function RepeatWeeksPicker({
  id,
  value,
  onChange,
  days,
  from,
  until,
  cycleFrom,
  defaultWeek = 1,
  size = 'normal',
}: {
  id: string;
  value: RepeatWeeks;
  onChange: (value: RepeatWeeks) => void;
  /// The weekdays chosen, for the preview.
  days: number[];
  /// The first date it can be on, and the last.
  from: string;
  until?: string;
  /// For every 2+ weeks: a date in a week it is on. Absent: `from`.
  cycleFrom?: string;
  /// The week of the month picked on switching to "certain weeks".
  defaultWeek?: number;
  size?: 'normal' | 'small';
}) {
  const byMonth = value.weeksOfMonth.length > 0;
  const field =
    size === 'small'
      ? 'mt-1 w-full rounded-lg border-slate-300 py-1.5 text-sm shadow-sm'
      : 'mt-1 w-full rounded-lg border-slate-300 py-2.5 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600';
  const padding = size === 'small' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm';
  // One more than shown, to know whether there are more.
  const found = isEveryWeek(value)
    ? []
    : firstDates(from, days, value, 4, until, cycleFrom ?? from);
  const preview = found.slice(0, 3);

  return (
    <div data-testid="repeat-weeks">
      <label
        htmlFor={id}
        className={`block font-medium ${size === 'small' ? 'text-sm text-slate-800' : 'text-sm text-slate-700'}`}
      >
        Which weeks
      </label>
      <select
        id={id}
        value={byMonth ? BY_MONTH : String(value.everyWeeks)}
        onChange={(event) =>
          onChange(
            event.target.value === BY_MONTH
              ? { everyWeeks: 1, weeksOfMonth: [defaultWeek] }
              : { everyWeeks: Number(event.target.value), weeksOfMonth: [] },
          )
        }
        className={`${field} sm:max-w-xs`}
      >
        <option value="1">Every week</option>
        <option value="2">Every other week</option>
        <option value="3">Every 3 weeks</option>
        <option value="4">Every 4 weeks</option>
        <option value={BY_MONTH}>Certain weeks of the month</option>
      </select>

      {byMonth && (
        <fieldset className="mt-2">
          <legend className="sr-only">Weeks of the month</legend>
          <div className="flex flex-wrap items-center gap-1">
            {WEEKS_OF_MONTH.map((week) => {
              const on = value.weeksOfMonth.includes(week.value);
              return (
                <button
                  key={week.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={`The ${week.long} of the month`}
                  onClick={() => {
                    // At least one stays on; "Every week" is in the list above.
                    if (on && value.weeksOfMonth.length === 1) return;
                    onChange({
                      everyWeeks: 1,
                      weeksOfMonth: on
                        ? value.weeksOfMonth.filter((w) => w !== week.value)
                        : [...value.weeksOfMonth, week.value],
                    });
                  }}
                  className={`rounded-lg font-medium ${padding} ${
                    on
                      ? 'bg-brand-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {week.short}
                </button>
              );
            })}
            <span className="ml-1 text-sm text-slate-600">of the month</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            The 1st is the one on the 1st to the 7th, the 2nd on the 8th to the 14th, and so on.
            &ldquo;Last&rdquo; is the last one, even when a month has five.
          </p>
        </fieldset>
      )}
      {isEveryWeek(value) || days.length === 0 ? null : preview.length > 0 ? (
        <p className="mt-1 text-xs text-slate-600" data-testid="repeat-preview">
          {found.length > 3 ? 'On ' : preview.length === 1 ? 'Only on ' : 'Just on '}
          {preview.map((date) => formatCalendarDate(date, { year: false })).join(' · ')}
          {found.length > 3 ? ', and so on' : until ? ', before it ends' : ''}
        </p>
      ) : (
        <p className="mt-1 text-xs text-rose-600">No dates fall in that range.</p>
      )}
    </div>
  );
}
