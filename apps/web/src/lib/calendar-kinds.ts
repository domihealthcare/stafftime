import type { EventKind } from './types';

/**
 * The kinds of entry on the practice calendar (October 2026, Dominguez: "a
 * calendar that staff can reference for multiple things"), each with the
 * words and colours it wears everywhere it is shown — the Calendar, the rota's
 * events row, the month, Home. Pay days are not stored: they are worked out
 * from the pay period, so they are a kind here but never an event.
 *
 * Tailwind finds class names by reading the source, so each is written out
 * whole rather than built from a colour name.
 */
export type CalendarKind = EventKind | 'PAY_DAY';

export interface KindStyle {
  /// "Diagnostics" — a filter chip, a heading.
  label: string;
  /// "Diagnostics date" — a form's heading, a menu item.
  one: string;
  emoji: string;
  /// A chip: tint, text, ring and hover.
  chip: string;
  /// The second line of a chip, a shade lighter than its first.
  subtle: string;
  /// A small dot in the key.
  dot: string;
}

export const KIND_STYLE: Record<CalendarKind, KindStyle> = {
  EVENT: {
    label: 'Meetings & events',
    one: 'Event',
    emoji: '📅',
    chip: 'bg-indigo-50 text-indigo-950 ring-indigo-200 hover:bg-indigo-100',
    subtle: 'text-indigo-800',
    dot: 'bg-indigo-500',
  },
  DIAGNOSTIC: {
    label: 'Diagnostics',
    one: 'Diagnostics date',
    emoji: '🩺',
    // Blue, well apart from pay days' green, so the two never read as one.
    chip: 'bg-sky-50 text-sky-950 ring-sky-300 hover:bg-sky-100',
    subtle: 'text-sky-800',
    dot: 'bg-sky-600',
  },
  HOLIDAY: {
    label: 'Holidays',
    one: 'Holiday',
    emoji: '⭐',
    chip: 'bg-amber-50 text-amber-950 ring-amber-300 hover:bg-amber-100',
    subtle: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  CLOSURE: {
    label: 'Closures',
    one: 'Closure',
    emoji: '🔒',
    chip: 'bg-slate-200 text-slate-900 ring-slate-400 hover:bg-slate-300',
    subtle: 'text-slate-700',
    dot: 'bg-slate-600',
  },
  PAY_DAY: {
    label: 'Pay days',
    one: 'Pay day',
    emoji: '💵',
    chip: 'bg-emerald-50 text-emerald-950 ring-emerald-300',
    subtle: 'text-emerald-800',
    dot: 'bg-emerald-600',
  },
};

/// The order they are listed in, filtered by and shown on a day.
export const CALENDAR_KINDS: CalendarKind[] = [
  'CLOSURE',
  'HOLIDAY',
  'PAY_DAY',
  'DIAGNOSTIC',
  'EVENT',
];

/// "WNY", "NB": an office as the practice writes it on its own calendar.
/// Made from the name's initials, so a third office needs nothing added.
export function officeShort(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join('');
  return initials.length >= 2 ? initials : name;
}
