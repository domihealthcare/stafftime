import { useEffect, useId, useState } from 'react';
import type { RepeatInput } from '../lib/types';
import { WEEK_ORDER } from '../lib/format';

/**
 * How an event repeats (September 2026): every week, every 2 weeks, monthly —
 * on the same date or on "the first Friday" — or a custom mix such as every 2
 * weeks on Monday and Friday. Always until a date, at most a year on.
 *
 * The dates themselves are worked out by the server from the event's first
 * day; this only describes the rule.
 */

type Mode = 'none' | 'weekly' | 'biweekly' | 'monthlyDate' | 'monthlyWeekday' | 'custom';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ORDINAL: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};

/// 1 = Monday … 7 = Sunday, for a "YYYY-MM-DD".
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/// The week of the month, 1–4, or -1 for the fifth ("the last").
export function weekOfMonth(date: string): number {
  const week = Math.ceil(Number(date.slice(8, 10)) / 7);
  return week > 4 ? -1 : week;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ordinalDay(day: number): string {
  const s =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${day}${s}`;
}

/// Which of the menu's choices a rule is, for a series being edited.
function modeOf(value: RepeatInput | null, startDate: string): Mode {
  if (!value) return 'none';
  const oneDay = value.weekdays?.length === 1 && value.weekdays[0] === weekdayOf(startDate);
  if (value.frequency === 'WEEKLY' && oneDay && value.interval === 1) return 'weekly';
  if (value.frequency === 'WEEKLY' && oneDay && value.interval === 2) return 'biweekly';
  if (value.frequency === 'MONTHLY' && value.interval === 1) {
    if (value.monthlyMode === 'DAY_OF_MONTH') return 'monthlyDate';
    if (value.monthlyWeek === weekOfMonth(startDate)) return 'monthlyWeekday';
  }
  return 'custom';
}

export function RepeatPicker({
  startDate,
  value,
  onChange,
}: {
  /// The event's first day, "2026-10-02".
  startDate: string;
  value: RepeatInput | null;
  onChange: (next: RepeatInput | null) => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>(() => modeOf(value, startDate));
  const weekday = weekdayOf(startDate);
  const until = value?.until ?? addDays(startDate, 91);

  /// The rule a menu choice stands for, on the event's own first day.
  const ruleFor = (next: Mode, current: RepeatInput | null): RepeatInput | null => {
    const end =
      current?.until && current.until >= startDate ? current.until : addDays(startDate, 91);
    switch (next) {
      case 'none':
        return null;
      case 'weekly':
        return { frequency: 'WEEKLY', interval: 1, weekdays: [weekday], until: end };
      case 'biweekly':
        return { frequency: 'WEEKLY', interval: 2, weekdays: [weekday], until: end };
      case 'monthlyDate':
        return { frequency: 'MONTHLY', interval: 1, monthlyMode: 'DAY_OF_MONTH', until: end };
      case 'monthlyWeekday':
        return {
          frequency: 'MONTHLY',
          interval: 1,
          monthlyMode: 'WEEKDAY_OF_MONTH',
          monthlyWeek: weekOfMonth(startDate),
          until: end,
        };
      case 'custom':
        return current ?? { frequency: 'WEEKLY', interval: 1, weekdays: [weekday], until: end };
    }
  };

  // A menu choice follows the event when its first day moves: "every 2 weeks
  // on Friday" becomes "on Thursday" if the meeting moves to a Thursday.
  useEffect(() => {
    if (mode !== 'custom' && mode !== 'none') onChange(ruleFor(mode, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  const field =
    'mt-1 rounded-lg border-slate-300 text-sm shadow-sm focus:border-brand-600 focus:ring-brand-600';
  const dayName = DAYS[weekday - 1];

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`${id}-mode`} className="block text-sm font-medium text-slate-700">
          Repeats
        </label>
        <select
          id={`${id}-mode`}
          value={mode}
          onChange={(change) => {
            const next = change.target.value as Mode;
            setMode(next);
            onChange(ruleFor(next, value));
          }}
          className={`${field} w-full`}
        >
          <option value="none">Does not repeat</option>
          <option value="weekly">Every week on {dayName}</option>
          <option value="biweekly">Every 2 weeks on {dayName}</option>
          <option value="monthlyDate">
            Every month on the {ordinalDay(Number(startDate.slice(8, 10)))}
          </option>
          <option value="monthlyWeekday">
            Every month on the {ORDINAL[weekOfMonth(startDate)]} {dayName}
          </option>
          <option value="custom">Custom…</option>
        </select>
      </div>

      {mode === 'custom' && value && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm text-slate-700" htmlFor={`${id}-interval`}>
              Every
            </label>
            <input
              id={`${id}-interval`}
              type="number"
              min={1}
              max={12}
              value={value.interval}
              onChange={(change) =>
                onChange({
                  ...value,
                  interval: Math.max(1, Math.min(12, Number(change.target.value) || 1)),
                })
              }
              aria-label="Every how many"
              className={`${field} w-16`}
            />
            <select
              aria-label="Weeks or months"
              value={value.frequency}
              onChange={(change) =>
                onChange(
                  change.target.value === 'WEEKLY'
                    ? {
                        frequency: 'WEEKLY',
                        interval: value.interval,
                        weekdays: [weekday],
                        until: value.until,
                      }
                    : {
                        frequency: 'MONTHLY',
                        interval: value.interval,
                        monthlyMode: 'DAY_OF_MONTH',
                        until: value.until,
                      },
                )
              }
              className={field}
            >
              <option value="WEEKLY">{value.interval === 1 ? 'week' : 'weeks'}</option>
              <option value="MONTHLY">{value.interval === 1 ? 'month' : 'months'}</option>
            </select>
          </div>

          {value.frequency === 'WEEKLY' ? (
            <div role="group" aria-label="On these days" className="flex flex-wrap gap-1">
              {WEEK_ORDER.map((day) => {
                const name = DAYS[day - 1];
                const on = value.weekdays?.includes(day) ?? false;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    aria-label={name}
                    onClick={() => {
                      const days = on
                        ? (value.weekdays ?? []).filter((d) => d !== day)
                        : [...(value.weekdays ?? []), day].sort();
                      onChange({ ...value, weekdays: days });
                    }}
                    className={`h-9 w-9 rounded-full text-sm font-semibold ring-1 ring-inset ${
                      on
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {name.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          ) : (
            <fieldset className="space-y-1 text-sm text-slate-700">
              <legend className="sr-only">Which day of the month</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-monthly`}
                  checked={value.monthlyMode !== 'WEEKDAY_OF_MONTH'}
                  onChange={() =>
                    onChange({ ...value, monthlyMode: 'DAY_OF_MONTH', monthlyWeek: undefined })
                  }
                />
                On the {ordinalDay(Number(startDate.slice(8, 10)))}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-monthly`}
                  checked={
                    value.monthlyMode === 'WEEKDAY_OF_MONTH' &&
                    value.monthlyWeek === weekOfMonth(startDate)
                  }
                  onChange={() =>
                    onChange({
                      ...value,
                      monthlyMode: 'WEEKDAY_OF_MONTH',
                      monthlyWeek: weekOfMonth(startDate),
                    })
                  }
                />
                On the {ORDINAL[weekOfMonth(startDate)]} {dayName}
              </label>
              {weekOfMonth(startDate) === 4 && Number(addDays(startDate, 7).slice(8, 10)) < 8 && (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${id}-monthly`}
                    checked={value.monthlyMode === 'WEEKDAY_OF_MONTH' && value.monthlyWeek === -1}
                    onChange={() =>
                      onChange({ ...value, monthlyMode: 'WEEKDAY_OF_MONTH', monthlyWeek: -1 })
                    }
                  />
                  On the last {dayName}
                </label>
              )}
            </fieldset>
          )}
        </div>
      )}

      {mode !== 'none' && (
        <div>
          <label htmlFor={`${id}-until`} className="block text-sm font-medium text-slate-700">
            Until
          </label>
          <input
            id={`${id}-until`}
            type="date"
            required
            min={startDate}
            max={addDays(startDate, 366)}
            value={until}
            onChange={(change) => value && onChange({ ...value, until: change.target.value })}
            className={field}
          />
          <p className="mt-1 text-xs text-slate-500">
            Up to a year ahead. Each date can still be moved or removed on its own.
          </p>
        </div>
      )}
    </div>
  );
}
