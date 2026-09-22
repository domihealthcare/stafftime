import { buildCalendar, escapeText, fold, formatDate, formatUtc } from './ical';

const NOW = new Date('2026-09-22T10:00:00.000Z');

describe('formatting', () => {
  it('writes a UTC timestamp in iCalendar form', () => {
    expect(formatUtc(new Date('2026-09-21T13:04:05.678Z'))).toBe('20260921T130405Z');
  });

  it('writes a date-only value', () => {
    expect(formatDate(new Date('2026-11-03T00:00:00.000Z'))).toBe('20261103');
  });
});

describe('escapeText', () => {
  it('escapes the characters that would otherwise end a value', () => {
    expect(escapeText('Front desk, North Bergen; suite 3')).toBe(
      'Front desk\\, North Bergen\; suite 3',
    );
  });

  it('escapes newlines rather than emitting a real line break', () => {
    expect(escapeText('line one\nline two')).toBe('line one\\nline two');
    expect(escapeText('crlf\r\nhere')).toBe('crlf\\nhere');
  });

  it('escapes backslashes before anything else, so escapes are not doubled', () => {
    expect(escapeText('a\\b,c')).toBe('a\\\\b\\,c');
  });
});

describe('fold', () => {
  it('leaves a short line alone', () => {
    expect(fold('SUMMARY:Work')).toBe('SUMMARY:Work');
  });

  it('folds a long line with a leading space on continuations', () => {
    const folded = fold(`DESCRIPTION:${'a'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBeLessThanOrEqual(75);
    for (const line of lines.slice(1)) {
      expect(line.startsWith(' ')).toBe(true);
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('unfolds back to the original', () => {
    const original = `DESCRIPTION:${'abcde '.repeat(40).trim()}`;
    const unfolded = fold(original).replace(/\r\n /g, '');
    expect(unfolded).toBe(original);
  });

  it('never splits a multi-byte character', () => {
    // Emoji are four octets each; a naive character-count fold would break them.
    const original = `SUMMARY:${'🏥'.repeat(40)}`;
    const folded = fold(original);
    for (const line of folded.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(original);
  });
});

describe('buildCalendar', () => {
  const shift = {
    uid: 'shift-1@staff.domihealthcare.com',
    sequence: 1700000000,
    summary: 'Work — North Bergen',
    location: '7650 Bergenline Ave, North Bergen, NJ',
    start: new Date('2026-09-23T13:00:00.000Z'),
    end: new Date('2026-09-23T21:00:00.000Z'),
  };

  const build = (events = [shift]) =>
    buildCalendar(events, { name: 'Frankie Front-Desk — Domi', now: NOW });

  it('uses CRLF line endings throughout', () => {
    const output = build();
    expect(output.includes('\r\n')).toBe(true);
    // No bare newline anywhere.
    expect(/[^\r]\n/.test(output)).toBe(false);
    expect(output.endsWith('\r\n')).toBe(true);
  });

  it('wraps everything in a VCALENDAR with the required properties', () => {
    const lines = build().split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('CALSCALE:GREGORIAN');
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true);
    expect(lines.filter((l) => l === 'END:VCALENDAR')).toHaveLength(1);
  });

  it('names the calendar for the apps that show it', () => {
    const output = build();
    expect(output).toContain('X-WR-CALNAME:Frankie Front-Desk — Domi');
  });

  it('asks subscribers to refresh', () => {
    const output = buildCalendar([shift], { name: 'x', refreshMinutes: 30, now: NOW });
    expect(output).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT30M');
    expect(output).toContain('X-PUBLISHED-TTL:PT30M');
  });

  it('writes a timed event with UTC start and end', () => {
    const lines = build().split('\r\n');
    expect(lines).toContain('DTSTART:20260923T130000Z');
    expect(lines).toContain('DTEND:20260923T210000Z');
    expect(lines).toContain('TRANSP:OPAQUE');
  });

  it('carries a stable UID and a sequence', () => {
    const lines = build().split('\r\n');
    expect(lines).toContain('UID:shift-1@staff.domihealthcare.com');
    expect(lines).toContain('SEQUENCE:1700000000');
  });

  it('stamps every event with the generation time', () => {
    expect(build()).toContain('DTSTAMP:20260922T100000Z');
  });

  it('writes an all-day event with an exclusive end date', () => {
    const output = buildCalendar(
      [
        {
          uid: 'pto-1@staff.domihealthcare.com',
          sequence: 1,
          summary: 'Vacation',
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-07T00:00:00.000Z'),
          transparent: true,
        },
      ],
      { name: 'x', now: NOW },
    );
    const lines = output.split('\r\n');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261103');
    // The 7th is the last day off, so DTEND is the 8th.
    expect(lines).toContain('DTEND;VALUE=DATE:20261108');
    expect(lines).toContain('TRANSP:TRANSPARENT');
  });

  it('marks a single all-day event as one day, not zero', () => {
    const output = buildCalendar(
      [
        {
          uid: 'pto-2@x',
          sequence: 1,
          summary: 'Sick',
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2026-11-03T00:00:00.000Z'),
        },
      ],
      { name: 'x', now: NOW },
    );
    expect(output).toContain('DTSTART;VALUE=DATE:20261103');
    expect(output).toContain('DTEND;VALUE=DATE:20261104');
  });

  it('pairs every BEGIN:VEVENT with an END:VEVENT', () => {
    const output = buildCalendar([shift, { ...shift, uid: 'shift-2@x' }], {
      name: 'x',
      now: NOW,
    });
    const lines = output.split('\r\n');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.filter((l) => l === 'END:VEVENT')).toHaveLength(2);
  });

  it('produces a valid, empty calendar when there is nothing scheduled', () => {
    const output = buildCalendar([], { name: 'x', now: NOW });
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).toContain('END:VCALENDAR');
    expect(output).not.toContain('BEGIN:VEVENT');
  });

  it('escapes a location containing commas, so the value does not split', () => {
    const output = build();
    expect(output).toContain('7650 Bergenline Ave\\, North Bergen\\, NJ');
  });

  it('refuses an event with no dates rather than emitting a broken one', () => {
    expect(() =>
      buildCalendar([{ uid: 'broken@x', sequence: 1, summary: 'Nothing' }], {
        name: 'x',
        now: NOW,
      }),
    ).toThrow(/neither a time range nor a date range/);
  });

  it('keeps every emitted line within 75 octets', () => {
    const output = buildCalendar(
      [
        {
          ...shift,
          summary: 'Work — '.repeat(20),
          description: 'Cover the front desk, answer phones; check the fridge logs. '.repeat(5),
        },
      ],
      { name: 'A very long calendar name '.repeat(5), now: NOW },
    );
    for (const line of output.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
