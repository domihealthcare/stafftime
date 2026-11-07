import { addCalendarDays } from './dates';
import { PRACTICE_ZONE, practiceMidnight } from './practice-time';
import type { CallAttempt, CallLogEntry, CallOutcome, OnCallLayer, OnCallSegment } from './types';

/**
 * Pure helpers for the after-hours call screens: who is on at each New Jersey
 * hour of a day (the days the clocks change are 23 and 25 hours long), the
 * words for outcomes, and the voices to pick from.
 */

export const VOICES_EN = [
  { value: 'Polly.Joanna-Neural', label: 'Joanna (default)' },
  { value: 'Polly.Ruth-Neural', label: 'Ruth' },
  { value: 'Polly.Danielle-Neural', label: 'Danielle' },
  { value: 'Polly.Matthew-Neural', label: 'Matthew' },
  { value: 'Polly.Stephen-Neural', label: 'Stephen' },
];

export const VOICES_ES = [
  { value: 'Polly.Lupe-Neural', label: 'Lupe (default)' },
  { value: 'Polly.Pedro-Neural', label: 'Pedro' },
  { value: 'Polly.Mia-Neural', label: 'Mia (Mexico)' },
];

export const MIN_RING_SECONDS = 10;
export const MAX_RING_SECONDS = 60;

/// Fixed, distinct colours, one per provider in list order. Whole class names
/// so Tailwind sees them. Colour is never the only sign: cells are labelled.
export const PROVIDER_COLOURS = [
  { bg: 'bg-sky-200', text: 'text-sky-900' },
  { bg: 'bg-emerald-200', text: 'text-emerald-900' },
  { bg: 'bg-amber-200', text: 'text-amber-900' },
  { bg: 'bg-fuchsia-200', text: 'text-fuchsia-900' },
  { bg: 'bg-orange-200', text: 'text-orange-900' },
  { bg: 'bg-teal-300', text: 'text-teal-950' },
  { bg: 'bg-violet-200', text: 'text-violet-900' },
  { bg: 'bg-lime-300', text: 'text-lime-950' },
];
export const NOBODY_COLOUR = { bg: 'bg-slate-100', text: 'text-slate-600' };

export function colourFor(index: number) {
  return index < 0 ? NOBODY_COLOUR : PROVIDER_COLOURS[index % PROVIDER_COLOURS.length];
}

export function sourceWords(source: OnCallLayer): string {
  switch (source) {
    case 'USUAL':
      return 'Usual pattern';
    case 'CHANGED':
      return 'Changed day';
    case 'SWAPPED':
      return 'Swap';
    case 'COVER':
      return 'Cover';
    case 'DEFAULT':
      return 'Default provider';
    default:
      return 'Nobody';
  }
}

export interface HourCell {
  /// The instant the hour starts (ISO).
  startsAt: string;
  /// "12 AM", "1 AM", or "1 AM (second time)" on the day the clocks go back.
  label: string;
  segment: OnCallSegment | null;
}

function hourLabel(instant: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PRACTICE_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(instant),
  );
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`;
}

/// The segment holding `instant`, or null.
export function segmentAt(segments: OnCallSegment[], instant: number): OnCallSegment | null {
  for (const segment of segments) {
    if (Date.parse(segment.startsAt) <= instant && instant < Date.parse(segment.endsAt)) {
      return segment;
    }
  }
  return null;
}

/// One cell per hour of a New Jersey calendar day: 24, or 23 and 25 when the
/// clocks change. The answer for an hour is the one at its first minute.
export function hourCells(date: string, segments: OnCallSegment[]): HourCell[] {
  const start = Date.parse(practiceMidnight(date));
  const end = Date.parse(practiceMidnight(addCalendarDays(date, 1)));
  const count = Math.round((end - start) / 3_600_000);
  const seen = new Set<string>();
  const cells: HourCell[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = start + index * 3_600_000;
    let label = hourLabel(new Date(at));
    if (seen.has(label)) label = `${label} (second time)`;
    seen.add(label);
    cells.push({
      startsAt: new Date(at).toISOString(),
      label,
      segment: segmentAt(segments, at),
    });
  }
  return cells;
}

/// A line about the clock change, or null on an ordinary day.
export function clockChangeNote(cells: HourCell[]): string | null {
  if (cells.length === 23) return 'The clocks go forward: this day has 23 hours (no 2 AM).';
  if (cells.length === 25) return 'The clocks go back: this day has 25 hours (1 AM twice).';
  return null;
}

export interface DayRun {
  employeeId: string | null;
  /// The label of the first hour of the run.
  from: string;
}

/// The day as runs of one provider: "Dr. A until 12 PM, then Dr. B".
export function dayRuns(cells: HourCell[]): DayRun[] {
  const runs: DayRun[] = [];
  for (const cell of cells) {
    const who = cell.segment?.employeeId ?? null;
    const last = runs[runs.length - 1];
    if (!last || last.employeeId !== who) runs.push({ employeeId: who, from: cell.label });
  }
  return runs;
}

export function dayWords(cells: HourCell[], nameOf: (id: string | null) => string): string {
  const runs = dayRuns(cells);
  if (runs.length <= 1) return `${nameOf(runs[0]?.employeeId ?? null)} all day`;
  return runs
    .map((run, index) => {
      const name = nameOf(run.employeeId);
      const next = runs[index + 1];
      if (index === 0) return `${name} until ${next.from}`;
      return next ? `then ${name} until ${next.from}` : `then ${name}`;
    })
    .join(', ');
}

/// "+12015550142" -> "(201) 555-0142"; null -> "Withheld".
export function formatCaller(number: string | null): string {
  if (!number) return 'Withheld';
  const digits = number.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return number;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function outcomeWords(entry: Pick<CallLogEntry, 'outcome' | 'acceptedBy'>): string {
  const who = entry.acceptedBy?.name;
  switch (entry.outcome as CallOutcome) {
    case 'ACCEPTED':
      return who ? `Accepted by ${who}` : 'Accepted';
    case 'RANG_THROUGH':
      return who ? `Rang through to ${who}'s phone` : 'Rang through';
    case 'NOT_REACHED':
      return 'Nobody reached';
    case 'CALLER_HUNG_UP':
      return 'Caller hung up';
    default:
      return 'In progress';
  }
}

export function outcomeTone(outcome: CallOutcome): 'success' | 'warning' | 'danger' | 'neutral' {
  if (outcome === 'ACCEPTED' || outcome === 'RANG_THROUGH') return 'success';
  if (outcome === 'NOT_REACHED') return 'danger';
  if (outcome === 'CALLER_HUNG_UP') return 'warning';
  return 'neutral';
}

export function roleWords(role: CallAttempt['role']): string {
  switch (role) {
    case 'ON_CALL':
      return 'On call';
    case 'BACKUP':
      return 'Backup';
    case 'FINAL':
      return 'On call (voicemail try)';
    case 'DEFAULT':
      return 'Default provider';
    default:
      return 'Emergency fallback';
  }
}

export function resultWords(result: string | null): string {
  if (!result) return 'no result';
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/// A plain check for a recording link: https only.
export function isHttpsLink(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/// Default cover times for a clicked date: 5 PM that day to 8 AM the next.
export function defaultCover(date: string) {
  return {
    startDate: date,
    startTime: '17:00',
    endDate: addCalendarDays(date, 1),
    endTime: '08:00',
  };
}

/// "YYYY-MM-DDTHH:MM"
export function wallClock(date: string, time: string): string {
  return `${date}T${time}`;
}

export function splitWallClock(value: string): { date: string; time: string } {
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}
