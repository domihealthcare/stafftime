import { WEEK_ORDER, WEEKDAY_NAMES } from '../lib/format';

/// Sunday first, as the calendar reads; the values are the API's, 1 = Monday.
const WEEKDAYS = WEEK_ORDER.map((value) => ({
  value,
  short: WEEKDAY_NAMES[value - 1].slice(0, 3),
}));

/// Which days of the week a repeating shift is on.
export function WeekdayToggles({
  days,
  onChange,
  size = 'normal',
}: {
  days: number[];
  onChange: (days: number[]) => void;
  size?: 'normal' | 'small';
}) {
  const padding = size === 'small' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm';
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {WEEKDAYS.map((day) => {
        const on = days.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? days.filter((value) => value !== day.value) : [...days, day.value])
            }
            className={`rounded-lg font-medium ${padding} ${
              on
                ? 'bg-brand-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}
