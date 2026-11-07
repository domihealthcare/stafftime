import { describe, expect, it } from 'vitest';
import {
  defaultCover,
  formatCaller,
  isHttpsLink,
  outcomeWords,
  overrideRange,
  overrideTouches,
  resultWords,
} from './call-routing';

describe('words', () => {
  it('formats callers', () => {
    expect(formatCaller('+12015550142')).toBe('(201) 555-0142');
    expect(formatCaller(null)).toBe('Withheld');
  });
  it('names outcomes', () => {
    expect(outcomeWords({ outcome: 'ACCEPTED', acceptedBy: { id: '1', name: 'Dr. X' } })).toBe(
      'Accepted by Dr. X',
    );
    expect(outcomeWords({ outcome: 'NOT_REACHED', acceptedBy: null })).toBe('Nobody reached');
    expect(resultWords('no answer')).toBe('No answer');
  });
  it('checks links and default override times', () => {
    expect(isHttpsLink('https://x.twil.io/a.mp3')).toBe(true);
    expect(isHttpsLink('http://x.com')).toBe(false);
    expect(defaultCover('2026-12-31')).toEqual({
      startDate: '2026-12-31',
      startTime: '18:00',
      endDate: '2027-01-01',
      endTime: '06:00',
    });
  });
});

describe('overrides', () => {
  it('words a range', () => {
    expect(overrideRange('2026-11-13T18:00', '2026-11-14T06:00')).toBe(
      'Fri, Nov 13, 6:00 PM to Sat 6:00 AM',
    );
    expect(overrideRange('2026-11-13T09:00', '2026-11-13T12:30')).toBe(
      'Fri, Nov 13, 9:00 AM to 12:30 PM',
    );
    expect(overrideRange('2026-11-13T18:00', '2026-11-16T06:00')).toBe(
      'Fri, Nov 13, 6:00 PM to Mon, Nov 16, 6:00 AM',
    );
  });
  it('knows which days an override touches', () => {
    const cover = { startsLocal: '2026-11-13T18:00', endsLocal: '2026-11-14T06:00' };
    expect(overrideTouches(cover, '2026-11-12')).toBe(false);
    expect(overrideTouches(cover, '2026-11-13')).toBe(true);
    expect(overrideTouches(cover, '2026-11-14')).toBe(true);
    expect(overrideTouches(cover, '2026-11-15')).toBe(false);
    expect(
      overrideTouches(
        { startsLocal: '2026-11-13T18:00', endsLocal: '2026-11-14T00:00' },
        '2026-11-14',
      ),
    ).toBe(false);
  });
});
