import { useEffect, useRef, useState } from 'react';
import { addDays, addMonths, localDate, monthGrid, startOfMonth, startOfWeek } from '../lib/format';
import { locale, useT } from '../lib/i18n';
import { buttonClass } from './ui';

/**
 * A small month calendar for jumping straight to a week or month on the rota
 * (October 2026, Dominguez: "should include a mini calendar to skip to certain
 * weeks without having to go week by week"). Pressing a day goes to its week
 * (or its month, in the Month view); the arrows move a month, or a year with
 * the double arrows. The week or month on screen is shaded, today is ringed.
 */
export function JumpToDate({
  view,
  current,
  onPick,
}: {
  view: 'week' | 'month';
  /// The first day of the week or month on screen.
  current: Date;
  onPick: (day: Date) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(() => startOfMonth(current));
  const root = useRef<HTMLDivElement>(null);

  // Opening starts on the month being looked at.
  useEffect(() => {
    if (open) setShown(startOfMonth(view === 'week' ? addDays(current, 3) : current));
  }, [open, current, view]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const days = monthGrid(shown);
  const today = localDate(new Date());
  const inView = (day: Date) =>
    view === 'week'
      ? startOfWeek(day).getTime() === startOfWeek(current).getTime()
      : day.getMonth() === current.getMonth() && day.getFullYear() === current.getFullYear();
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(new Date()), index).toLocaleDateString(locale(), { weekday: 'narrow' }),
  );
  const step = (months: number) => setShown((month) => addMonths(month, months));
  const arrow =
    'flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900';

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
        className={`${buttonClass('secondary', 'sm')} w-full`}
      >
        <span aria-hidden="true">📅 </span>
        {view === 'week' ? t('Go to a week') : t('Go to a month')}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={view === 'week' ? t('Go to a week') : t('Go to a month')}
          data-testid="jump-to-date"
          className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex">
              <button
                type="button"
                aria-label={t('A year back')}
                onClick={() => step(-12)}
                className={arrow}
              >
                «
              </button>
              <button
                type="button"
                aria-label={t('A month back')}
                onClick={() => step(-1)}
                className={arrow}
              >
                ‹
              </button>
            </span>
            <span className="text-sm font-semibold text-slate-900" data-testid="jump-month">
              {shown.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
            </span>
            <span className="flex">
              <button
                type="button"
                aria-label={t('A month on')}
                onClick={() => step(1)}
                className={arrow}
              >
                ›
              </button>
              <button
                type="button"
                aria-label={t('A year on')}
                onClick={() => step(12)}
                className={arrow}
              >
                »
              </button>
            </span>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-slate-500" aria-hidden="true">
            {weekdays.map((name, index) => (
              <span key={index} className="py-1">
                {name}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
            {days.map((day) => {
              const key = localDate(day);
              const outside = day.getMonth() !== shown.getMonth();
              const here = inView(day);
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={day.toLocaleDateString(locale(), {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  aria-current={here ? 'date' : undefined}
                  onClick={() => {
                    onPick(day);
                    setOpen(false);
                  }}
                  className={`h-8 rounded-md ${here ? 'bg-brand-100 font-semibold text-brand-900' : 'hover:bg-slate-100'} ${
                    outside ? 'text-slate-400' : 'text-slate-800'
                  } ${key === today ? 'ring-2 ring-inset ring-brand-600' : ''}`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onPick(new Date());
              setOpen(false);
            }}
            className="mt-2 w-full rounded-md py-1 text-sm font-medium text-brand-800 hover:bg-brand-50"
          >
            {view === 'week' ? t('This week') : t('This month')}
          </button>
        </div>
      )}
    </div>
  );
}
