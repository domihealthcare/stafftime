import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, addMonths, localDate, startOfMonth, startOfWeek } from '../lib/format';
import type { DayRange, PayPeriodInfo } from '../lib/types';

type PresetKey =
  'this-week' | 'last-week' | 'this-pay-period' | 'last-pay-period' | 'this-month' | 'last-month';

interface Preset {
  key: PresetKey;
  label: string;
  range: DayRange | null;
  /// Why a preset cannot be used yet, when it cannot.
  unavailable?: string;
}

/// The pay periods, fetched once and shared: every picker on every screen asks
/// the same question and the answer changes once a fortnight.
let payPeriodRequest: Promise<PayPeriodInfo | null> | null = null;
function loadPayPeriod(): Promise<PayPeriodInfo | null> {
  payPeriodRequest ??= api.payPeriod().catch(() => {
    payPeriodRequest = null;
    return null;
  });
  return payPeriodRequest;
}

/// Forget the cached pay periods, after an admin changes the start date.
export function refreshPayPeriod() {
  payPeriodRequest = null;
}

export function presetRanges(today: Date, payPeriod: PayPeriodInfo | null): Preset[] {
  const monday = startOfWeek(today);
  const firstOfMonth = startOfMonth(today);
  const lastMonth = addMonths(firstOfMonth, -1);
  const waiting =
    payPeriod && !payPeriod.anchor ? 'Set the pay period start in Practice settings.' : undefined;
  return [
    { key: 'this-week', label: 'This week', range: span(monday, addDays(monday, 6)) },
    {
      key: 'last-week',
      label: 'Last week',
      range: span(addDays(monday, -7), addDays(monday, -1)),
    },
    {
      key: 'this-pay-period',
      label: 'This pay period',
      range: payPeriod?.current ?? null,
      unavailable: waiting,
    },
    {
      key: 'last-pay-period',
      label: 'Last pay period',
      range: payPeriod?.previous ?? null,
      unavailable: waiting,
    },
    {
      key: 'this-month',
      label: 'This month',
      range: span(firstOfMonth, addDays(addMonths(firstOfMonth, 1), -1)),
    },
    { key: 'last-month', label: 'Last month', range: span(lastMonth, addDays(firstOfMonth, -1)) },
  ];
}

/// The range a named preset stands for today, for a screen's starting value.
/// Null for a pay-period preset before the pay period is set up.
export function usePresetRange(key: PresetKey, fallback: PresetKey): DayRange | null {
  const [range, setRange] = useState<DayRange | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPayPeriod().then((payPeriod) => {
      if (cancelled) return;
      const presets = presetRanges(new Date(), payPeriod);
      setRange(
        presets.find((p) => p.key === key)?.range ?? presets.find((p) => p.key === fallback)!.range,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key, fallback]);
  return range;
}

/**
 * Which days a screen is about: a row of shortcuts — this or last week, pay
 * period or month — and, for anything else, two dates.
 *
 * The pay-period shortcuts come from the server, which counts fortnights from
 * the practice's pay-period start, so the Timesheet and the Export can never
 * disagree about which fortnight "last pay period" means.
 *
 * Previous and Next step by the same kind of period: a month moves a month,
 * and anything else moves by its own length.
 */
export function DateRangePicker({
  value,
  onChange,
  label = 'Period',
}: {
  value: DayRange;
  onChange: (range: DayRange) => void;
  label?: string;
}) {
  const [payPeriod, setPayPeriod] = useState<PayPeriodInfo | null>(null);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPayPeriod().then((info) => !cancelled && setPayPeriod(info));
    return () => {
      cancelled = true;
    };
  }, []);

  const presets = presetRanges(new Date(), payPeriod);
  const active = presets.find(
    (preset) => preset.range && preset.range.from === value.from && preset.range.to === value.to,
  );
  const showDates = custom || !active;

  const chip = (selected: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50 ${
      selected
        ? 'bg-brand-600 text-white ring-brand-600'
        : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
    }`;

  return (
    <div data-testid="date-range">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => onChange(step(value, -1))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ←
        </button>
        <span className="text-sm font-medium text-slate-800" data-testid="date-range-label">
          {describe(value)}
        </span>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => onChange(step(value, 1))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          →
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${label} shortcuts`}>
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            aria-pressed={!custom && active?.key === preset.key}
            disabled={!preset.range}
            title={preset.unavailable}
            onClick={() => {
              if (!preset.range) return;
              setCustom(false);
              onChange(preset.range);
            }}
            className={chip(!custom && active?.key === preset.key)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={showDates}
          onClick={() => setCustom(true)}
          className={chip(showDates)}
        >
          Custom
        </button>
      </div>
      {payPeriod && !payPeriod.anchor && (
        <p className="mt-1 text-xs text-slate-500">
          Pay-period shortcuts appear once an admin sets the pay period start in Practice settings.
        </p>
      )}

      {showDates && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">From</span>
            <input
              aria-label="From"
              type="date"
              value={value.from}
              max={value.to}
              onChange={(event) =>
                event.target.value && onChange({ ...value, from: event.target.value })
              }
              className="rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">To (included)</span>
            <input
              aria-label="To (included)"
              type="date"
              value={value.to}
              min={value.from}
              onChange={(event) =>
                event.target.value && onChange({ ...value, to: event.target.value })
              }
              className="rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function span(from: Date, to: Date): DayRange {
  return { from: localDate(from), to: localDate(to) };
}

function day(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/// A whole calendar month steps by months; anything else by its own length.
export function step(range: DayRange, direction: 1 | -1): DayRange {
  const from = day(range.from);
  const to = day(range.to);
  const wholeMonth =
    from.getDate() === 1 && addDays(to, 1).getDate() === 1 && from.getMonth() === to.getMonth();
  if (wholeMonth) {
    const start = addMonths(from, direction);
    return span(start, addDays(addMonths(start, 1), -1));
  }
  const length = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return span(addDays(from, direction * length), addDays(to, direction * length));
}

function describe(range: DayRange): string {
  const from = day(range.from);
  const to = day(range.to);
  const sameYear = from.getFullYear() === to.getFullYear();
  const start = from.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const end = to.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return range.from === range.to ? end : `${start} – ${end}`;
}

/// The API takes instants and an exclusive end: local midnight at the start of
/// `from`, and local midnight after the last day.
export function toInstants(range: DayRange): { from: string; to: string } {
  return {
    from: day(range.from).toISOString(),
    to: addDays(day(range.to), 1).toISOString(),
  };
}
