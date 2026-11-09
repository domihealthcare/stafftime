import { addCalendarDays } from './dates';
import type { CallAttempt, CallLogEntry, CallOutcome } from './types';

/**
 * Pure helpers for the after-hours call screens: the words for outcomes, the
 * voices to pick from and the wall-clock strings an override is saved with.
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

/// Default override times for a clicked date: 6 PM that day to 6 AM the next.
export function defaultCover(date: string) {
  return {
    startDate: date,
    startTime: '18:00',
    endDate: addCalendarDays(date, 1),
    endTime: '06:00',
  };
}

/// "YYYY-MM-DDTHH:MM"
export function wallClock(date: string, time: string): string {
  return `${date}T${time}`;
}

export function splitWallClock(value: string): { date: string; time: string } {
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

function dayWordsOf(date: string, withWeekday = true): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: withWeekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

/// "18:00" -> "6:00 PM"
export function timeWords(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/// "Fri, Nov 13, 6:00 PM to Sat 6:00 AM" from New Jersey wall-clock strings.
export function overrideRange(startsLocal: string, endsLocal: string): string {
  const start = splitWallClock(startsLocal);
  const end = splitWallClock(endsLocal);
  const first = `${dayWordsOf(start.date)}, ${timeWords(start.time)}`;
  if (end.date === start.date) return `${first} to ${timeWords(end.time)}`;
  if (end.date === addCalendarDays(start.date, 1)) {
    const weekday = dayWordsOf(end.date).split(',')[0];
    return `${first} to ${weekday} ${timeWords(end.time)}`;
  }
  return `${first} to ${dayWordsOf(end.date)}, ${timeWords(end.time)}`;
}

/// True when an override touches the New Jersey calendar day `date`.
export function overrideTouches(
  cover: { startsLocal: string; endsLocal: string },
  date: string,
): boolean {
  const start = splitWallClock(cover.startsLocal);
  const end = splitWallClock(cover.endsLocal);
  if (date < start.date || date > end.date) return false;
  return !(date === end.date && date !== start.date && end.time === '00:00');
}
