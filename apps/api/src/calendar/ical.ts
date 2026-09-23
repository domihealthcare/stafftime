/**
 * Minimal iCalendar (RFC 5545) writer.
 *
 * Hand-rolled rather than pulled from a library because the subset needed here
 * is small and the rules that actually break calendar apps are few:
 *
 *  - CRLF line endings, always
 *  - lines folded at 75 octets, continuations starting with a single space
 *  - `,` `;` `\` and newlines escaped inside TEXT values
 *  - a stable UID per event, so an update replaces rather than duplicates
 */

export interface CalendarEvent {
  /// Stable across regenerations of the same underlying record.
  uid: string;
  /// Bumped when the record changes, so subscribers take the new version.
  sequence: number;
  summary: string;
  description?: string;
  location?: string;
  /// Timed events use start/end; all-day events use startDate/endDate instead.
  start?: Date;
  end?: Date;
  /// Inclusive first day, for an all-day event.
  startDate?: Date;
  /// Inclusive last day. Converted to the exclusive DTEND iCalendar wants.
  endDate?: Date;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  transparent?: boolean;
}

export interface CalendarOptions {
  name: string;
  description?: string;
  /// How often a subscribing app should re-fetch.
  refreshMinutes?: number;
  now?: Date;
}

const PRODID = '-//Domi Healthcare//Domi Staff//EN';

export function buildCalendar(events: CalendarEvent[], options: CalendarOptions): string {
  const stamp = formatUtc(options.now ?? new Date());
  const refresh = `PT${options.refreshMinutes ?? 60}M`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    `NAME:${escapeText(options.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];

  if (options.description) {
    lines.push(`X-WR-CALDESC:${escapeText(options.description)}`);
    lines.push(`DESCRIPTION:${escapeText(options.description)}`);
  }

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SEQUENCE:${event.sequence}`);

    if (event.startDate && event.endDate) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(event.startDate)}`);
      // DTEND is exclusive for all-day events, so the day after the last one.
      lines.push(`DTEND;VALUE=DATE:${formatDate(addDays(event.endDate, 1))}`);
    } else if (event.start && event.end) {
      lines.push(`DTSTART:${formatUtc(event.start)}`);
      lines.push(`DTEND:${formatUtc(event.end)}`);
    } else {
      throw new Error(`Event ${event.uid} has neither a time range nor a date range`);
    }

    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    lines.push(`STATUS:${event.status ?? 'CONFIRMED'}`);
    // Time off should not make someone look busy to a scheduler.
    lines.push(`TRANSP:${event.transparent ? 'TRANSPARENT' : 'OPAQUE'}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/// 20260921T130000Z
export function formatUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/// 20260921
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Escapes a TEXT value. Order matters: backslashes first, or the escapes we add
 * afterwards get escaped again.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a line to 75 octets, continuing with a leading space.
 *
 * Counted in octets rather than characters because a multi-byte character split
 * across the boundary would corrupt it — so the split point is found by byte
 * length, never mid-character.
 */
export function fold(line: string): string {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes <= 75) {
    return line;
  }

  const pieces: string[] = [];
  let current = '';
  let currentBytes = 0;
  // Continuation lines carry a leading space, so they hold one octet less.
  let limit = 75;

  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    if (currentBytes + size > limit) {
      pieces.push(current);
      current = character;
      currentBytes = size;
      limit = 74;
    } else {
      current += character;
      currentBytes += size;
    }
  }
  pieces.push(current);

  return pieces.join('\r\n ');
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
