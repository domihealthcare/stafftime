import { describe, expect, it } from 'vitest';
import {
  clockChangeNote,
  dayWords,
  defaultCover,
  formatCaller,
  hourCells,
  isHttpsLink,
  outcomeWords,
  resultWords,
} from './call-routing';
import { practiceMidnight } from './practice-time';
import type { OnCallSegment } from './types';

function segment(from: string, to: string, employeeId: string | null): OnCallSegment {
  return {
    startsAt: practiceMidnight(from),
    endsAt: practiceMidnight(to),
    employeeId,
    backupEmployeeId: null,
    source: 'USUAL',
    coverId: null,
    turnDate: from,
  };
}

describe('hourCells', () => {
  it('has 24 hours on an ordinary day', () => {
    const cells = hourCells('2026-11-09', [segment('2026-11-01', '2026-12-01', 'a')]);
    expect(cells).toHaveLength(24);
    expect(cells[0].label).toBe('12 AM');
    expect(cells[12].label).toBe('12 PM');
    expect(clockChangeNote(cells)).toBeNull();
  });

  it('has 25 hours when the clocks go back, with 1 AM twice', () => {
    const cells = hourCells('2026-11-01', []);
    expect(cells).toHaveLength(25);
    expect(cells.map((c) => c.label).filter((l) => l.startsWith('1 AM'))).toEqual([
      '1 AM',
      '1 AM (second time)',
    ]);
    expect(clockChangeNote(cells)).toMatch(/25 hours/);
  });

  it('has 23 hours when the clocks go forward, with no 2 AM', () => {
    const cells = hourCells('2027-03-14', []);
    expect(cells).toHaveLength(23);
    expect(cells.some((c) => c.label === '2 AM')).toBe(false);
  });

  it('finds the provider at each hour', () => {
    const noon = practiceMidnight('2026-11-09');
    const segments: OnCallSegment[] = [
      {
        ...segment('2026-11-09', '2026-11-10', 'a'),
        endsAt: new Date(Date.parse(noon) + 12 * 3600000).toISOString(),
      },
      {
        ...segment('2026-11-09', '2026-11-10', 'b'),
        startsAt: new Date(Date.parse(noon) + 12 * 3600000).toISOString(),
      },
    ];
    const cells = hourCells('2026-11-09', segments);
    expect(cells[11].segment?.employeeId).toBe('a');
    expect(cells[12].segment?.employeeId).toBe('b');
    const names = (id: string | null) => (id === 'a' ? 'Dr. A' : id === 'b' ? 'Dr. B' : 'Nobody');
    expect(dayWords(cells, names)).toBe('Dr. A until 12 PM, then Dr. B');
  });

  it('says all day for one provider and nobody for a gap', () => {
    const cells = hourCells('2026-11-09', [segment('2026-11-09', '2026-11-10', 'a')]);
    expect(dayWords(cells, () => 'Dr. A')).toBe('Dr. A all day');
    expect(hourCells('2026-11-09', [])[3].segment).toBeNull();
  });
});

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
  it('checks links and default cover times', () => {
    expect(isHttpsLink('https://x.twil.io/a.mp3')).toBe(true);
    expect(isHttpsLink('http://x.com')).toBe(false);
    expect(defaultCover('2026-12-31')).toEqual({
      startDate: '2026-12-31',
      startTime: '17:00',
      endDate: '2027-01-01',
      endTime: '08:00',
    });
  });
});
