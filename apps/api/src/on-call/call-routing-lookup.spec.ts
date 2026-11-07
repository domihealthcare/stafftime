import { PRACTICE_ZONE, zonedTimeToUtc } from '../common/util/zoned-time.util';
import {
  segmentsBetween,
  whoIsOnCallAt,
  type LookupCover,
  type LookupData,
  type LookupDay,
  type LookupRota,
  type LookupRotaEntry,
} from './call-routing-lookup';

const nj = (date: string, time: string) => zonedTimeToUtc(date, time, PRACTICE_ZONE);

/// The same provider (and backup) every day of the week.
function everyDay(employeeId: string, backupEmployeeId: string | null = null): LookupRotaEntry[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    weekOfMonth: 0,
    employeeId,
    backupEmployeeId,
  }));
}

function rota(
  entries: LookupRotaEntry[],
  changesAt = '12:00',
  startsOn = '2026-01-01',
): LookupRota {
  return { startsOn, changesAt, entries };
}

function data(parts: Partial<LookupData> = {}): LookupData {
  return {
    rotas: [],
    days: new Map<string, LookupDay>(),
    covers: [],
    defaultProviderId: null,
    ...parts,
  };
}

function cover(
  id: string,
  startsAt: Date,
  endsAt: Date,
  employeeId: string,
  createdAt = new Date('2026-05-01T00:00:00Z'),
  backupEmployeeId: string | null = null,
): LookupCover {
  return { id, startsAt, endsAt, employeeId, backupEmployeeId, createdAt };
}

// 2026-06-01 is a Monday.
const monAB = (): LookupRota =>
  rota([
    { weekday: 1, weekOfMonth: 0, employeeId: 'A', backupEmployeeId: 'X' },
    { weekday: 2, weekOfMonth: 0, employeeId: 'B', backupEmployeeId: null },
  ]);

describe('whoIsOnCallAt: turns', () => {
  it('keeps Monday turn through Tuesday morning and hands over at noon', () => {
    const d = data({ rotas: [monAB()] });
    const night = whoIsOnCallAt(nj('2026-06-02', '02:00'), d);
    expect(night).toMatchObject({
      employeeId: 'A',
      backupEmployeeId: 'X',
      source: 'USUAL',
      turnDate: '2026-06-01',
    });
    expect(whoIsOnCallAt(nj('2026-06-02', '11:59'), d).employeeId).toBe('A');
    const noon = whoIsOnCallAt(nj('2026-06-02', '12:00'), d);
    expect(noon).toMatchObject({ employeeId: 'B', turnDate: '2026-06-02', backupEmployeeId: null });
  });

  it('honours a non-noon hand-over', () => {
    const d = data({ rotas: [{ ...monAB(), changesAt: '17:00' }] });
    expect(whoIsOnCallAt(nj('2026-06-02', '16:59'), d).employeeId).toBe('A');
    expect(whoIsOnCallAt(nj('2026-06-02', '17:00'), d).employeeId).toBe('B');
  });

  it('uses the rota in force for the turn date', () => {
    const d = data({
      rotas: [
        rota(everyDay('OLD'), '12:00', '2026-01-01'),
        rota(everyDay('NEW'), '12:00', '2026-06-02'),
      ],
    });
    expect(whoIsOnCallAt(nj('2026-06-02', '03:00'), d).employeeId).toBe('OLD');
    expect(whoIsOnCallAt(nj('2026-06-02', '13:00'), d).employeeId).toBe('NEW');
  });
});

describe('whoIsOnCallAt: layers', () => {
  it('a changed day beats the pattern and brings its own backup', () => {
    const days = new Map<string, LookupDay>([
      ['2026-06-01', { employeeId: 'C', backupEmployeeId: null, swapped: false }],
    ]);
    const got = whoIsOnCallAt(nj('2026-06-01', '20:00'), data({ rotas: [monAB()], days }));
    expect(got).toMatchObject({ employeeId: 'C', backupEmployeeId: null, source: 'CHANGED' });
    const withBackup = new Map<string, LookupDay>([
      ['2026-06-01', { employeeId: 'C', backupEmployeeId: 'Y', swapped: false }],
    ]);
    expect(
      whoIsOnCallAt(nj('2026-06-01', '20:00'), data({ rotas: [monAB()], days: withBackup }))
        .backupEmployeeId,
    ).toBe('Y');
  });

  it('reports SWAPPED for a swapped day', () => {
    const days = new Map<string, LookupDay>([
      ['2026-06-01', { employeeId: 'B', backupEmployeeId: null, swapped: true }],
    ]);
    expect(whoIsOnCallAt(nj('2026-06-02', '01:00'), data({ rotas: [monAB()], days })).source).toBe(
      'SWAPPED',
    );
  });

  it('a changed day applies to its turn only, not the morning before it', () => {
    const days = new Map<string, LookupDay>([
      ['2026-06-02', { employeeId: 'C', backupEmployeeId: null, swapped: false }],
    ]);
    const d = data({ rotas: [monAB()], days });
    expect(whoIsOnCallAt(nj('2026-06-02', '09:00'), d).employeeId).toBe('A');
    expect(whoIsOnCallAt(nj('2026-06-02', '12:00'), d).employeeId).toBe('C');
  });

  it('a cover beats a changed day and the pattern, with its own backup', () => {
    const days = new Map<string, LookupDay>([
      ['2026-06-01', { employeeId: 'C', backupEmployeeId: 'Y', swapped: false }],
    ]);
    const covers = [
      cover('c1', nj('2026-06-01', '18:00'), nj('2026-06-01', '23:00'), 'B', undefined, 'Z'),
    ];
    const d = data({ rotas: [monAB()], days, covers });
    expect(whoIsOnCallAt(nj('2026-06-01', '19:00'), d)).toMatchObject({
      employeeId: 'B',
      backupEmployeeId: 'Z',
      source: 'COVER',
      coverId: 'c1',
      turnDate: '2026-06-01',
    });
  });

  it('a cover splits a night: B for 18:00 to 23:00, then A resumes; end is exclusive', () => {
    const covers = [cover('c1', nj('2026-06-01', '18:00'), nj('2026-06-01', '23:00'), 'B')];
    const d = data({ rotas: [monAB()], covers });
    expect(whoIsOnCallAt(nj('2026-06-01', '17:59'), d).employeeId).toBe('A');
    expect(whoIsOnCallAt(nj('2026-06-01', '18:00'), d).employeeId).toBe('B');
    expect(whoIsOnCallAt(nj('2026-06-01', '22:59'), d).employeeId).toBe('B');
    const after = whoIsOnCallAt(nj('2026-06-01', '23:00'), d);
    expect(after).toMatchObject({ employeeId: 'A', source: 'USUAL', coverId: null });
  });

  it('the later-made cover wins where two overlap; the earlier still applies outside', () => {
    const covers = [
      cover(
        'early',
        nj('2026-06-01', '18:00'),
        nj('2026-06-01', '23:00'),
        'P',
        new Date('2026-05-01T00:00:00Z'),
      ),
      cover(
        'late',
        nj('2026-06-01', '20:00'),
        nj('2026-06-01', '21:00'),
        'Q',
        new Date('2026-05-02T00:00:00Z'),
      ),
    ];
    const d = data({ rotas: [monAB()], covers });
    expect(whoIsOnCallAt(nj('2026-06-01', '19:00'), d).employeeId).toBe('P');
    expect(whoIsOnCallAt(nj('2026-06-01', '20:30'), d).employeeId).toBe('Q');
    expect(whoIsOnCallAt(nj('2026-06-01', '21:00'), d).employeeId).toBe('P');
  });

  it('breaks a createdAt tie by the larger id', () => {
    const t = new Date('2026-05-01T00:00:00Z');
    const covers = [
      cover('a', nj('2026-06-01', '18:00'), nj('2026-06-01', '19:00'), 'P', t),
      cover('b', nj('2026-06-01', '18:00'), nj('2026-06-01', '19:00'), 'Q', t),
    ];
    expect(whoIsOnCallAt(nj('2026-06-01', '18:30'), data({ covers })).coverId).toBe('b');
  });

  it('drops a backup equal to the provider', () => {
    const d = data({ rotas: [rota(everyDay('A', 'A'))] });
    expect(whoIsOnCallAt(nj('2026-06-01', '13:00'), d).backupEmployeeId).toBeNull();
  });

  it('falls to the default provider with no backup, then to NONE', () => {
    const noMatch = data({ rotas: [monAB()], defaultProviderId: 'D' });
    // Wednesday has no entry.
    expect(whoIsOnCallAt(nj('2026-06-03', '13:00'), noMatch)).toMatchObject({
      employeeId: 'D',
      backupEmployeeId: null,
      source: 'DEFAULT',
    });
    expect(whoIsOnCallAt(nj('2026-06-03', '13:00'), data({ rotas: [monAB()] }))).toMatchObject({
      employeeId: null,
      source: 'NONE',
    });
    expect(whoIsOnCallAt(nj('2026-06-03', '13:00'), data())).toMatchObject({
      employeeId: null,
      backupEmployeeId: null,
      source: 'NONE',
      coverId: null,
      turnDate: '2026-06-03',
    });
  });

  it('week-of-month exceptions count weekends by their Saturday, with their backups', () => {
    const entries: LookupRotaEntry[] = [6, 7].flatMap((weekday) => [
      { weekday, weekOfMonth: 0, employeeId: 'A', backupEmployeeId: 'X' },
      { weekday, weekOfMonth: 4, employeeId: 'B', backupEmployeeId: 'Y' },
    ]);
    const d = data({ rotas: [rota(entries)] });
    // 2026-11-28 is the 4th Saturday; Sunday the 29th goes with it.
    expect(whoIsOnCallAt(nj('2026-11-22', '13:00'), d)).toMatchObject({
      employeeId: 'A',
      backupEmployeeId: 'X',
    });
    expect(whoIsOnCallAt(nj('2026-11-28', '13:00'), d)).toMatchObject({
      employeeId: 'B',
      backupEmployeeId: 'Y',
    });
    expect(whoIsOnCallAt(nj('2026-11-29', '13:00'), d)).toMatchObject({
      employeeId: 'B',
      backupEmployeeId: 'Y',
    });
    expect(whoIsOnCallAt(nj('2026-11-30', '02:00'), d)).toMatchObject({
      employeeId: 'B',
      turnDate: '2026-11-29',
    });
  });

  it('the last-week entry beats every week and loses to a numbered week', () => {
    const entries: LookupRotaEntry[] = [
      { weekday: 5, weekOfMonth: 0, employeeId: 'A', backupEmployeeId: null },
      { weekday: 5, weekOfMonth: -1, employeeId: 'L', backupEmployeeId: 'M' },
    ];
    const d = data({ rotas: [rota(entries)] });
    expect(whoIsOnCallAt(nj('2026-06-26', '13:00'), d)).toMatchObject({
      employeeId: 'L',
      backupEmployeeId: 'M',
    });
    expect(whoIsOnCallAt(nj('2026-06-19', '13:00'), d).employeeId).toBe('A');
  });
});

describe('clock changes', () => {
  it('spring forward with a noon hand-over: the turn is 23 hours long', () => {
    const d = data({ rotas: [rota(everyDay('A'))] });
    expect(whoIsOnCallAt(nj('2026-03-08', '11:59'), d).turnDate).toBe('2026-03-07');
    expect(whoIsOnCallAt(nj('2026-03-08', '12:00'), d).turnDate).toBe('2026-03-08');
    const segs = segmentsBetween(nj('2026-03-07', '12:00'), nj('2026-03-09', '12:00'), d);
    expect(segs.map((s) => s.turnDate)).toEqual(['2026-03-07', '2026-03-08']);
    expect(segs[0].endsAt.getTime() - segs[0].startsAt.getTime()).toBe(23 * 3_600_000);
  });

  it('a hand-over in the skipped hour lands an hour early and still gives one answer', () => {
    const d = data({
      rotas: [
        rota(
          [
            { weekday: 6, weekOfMonth: 0, employeeId: 'SAT', backupEmployeeId: null },
            { weekday: 7, weekOfMonth: 0, employeeId: 'SUN', backupEmployeeId: null },
          ],
          '02:30',
        ),
      ],
    });
    // 02:30 on 2026-03-08 does not exist; it resolves to 06:30Z (01:30 EST).
    expect(whoIsOnCallAt(new Date('2026-03-08T06:29:00Z'), d).employeeId).toBe('SAT');
    expect(whoIsOnCallAt(new Date('2026-03-08T06:30:00Z'), d).employeeId).toBe('SUN');
    // 03:00 EDT, just after the skipped hour.
    expect(whoIsOnCallAt(new Date('2026-03-08T07:00:00Z'), d).employeeId).toBe('SUN');
  });

  it('fall back: a hand-over in the repeated hour happens once, at the first 01:30', () => {
    const d = data({
      rotas: [
        rota(
          [
            { weekday: 6, weekOfMonth: 0, employeeId: 'SAT', backupEmployeeId: null },
            { weekday: 7, weekOfMonth: 0, employeeId: 'SUN', backupEmployeeId: null },
            { weekday: 1, weekOfMonth: 0, employeeId: 'MON', backupEmployeeId: null },
          ],
          '01:30',
        ),
      ],
    });
    expect(whoIsOnCallAt(new Date('2026-11-01T05:29:00Z'), d)).toMatchObject({
      employeeId: 'SAT',
      turnDate: '2026-10-31',
    });
    expect(whoIsOnCallAt(new Date('2026-11-01T05:30:00Z'), d).employeeId).toBe('SUN');
    // 01:10 EST, the second pass through the hour: still Sunday's turn.
    expect(whoIsOnCallAt(new Date('2026-11-01T06:10:00Z'), d).employeeId).toBe('SUN');
    expect(whoIsOnCallAt(new Date('2026-11-01T07:30:00Z'), d).employeeId).toBe('SUN');
    // Sunday's turn is 25 hours long.
    expect(whoIsOnCallAt(new Date('2026-11-02T06:29:00Z'), d).employeeId).toBe('SUN');
    expect(whoIsOnCallAt(new Date('2026-11-02T06:30:00Z'), d).employeeId).toBe('MON');
  });

  it('a cover entered across the change applies by instant', () => {
    const covers = [cover('c1', nj('2026-03-08', '01:00'), nj('2026-03-08', '04:00'), 'B')];
    const d = data({ rotas: [rota(everyDay('A'))], covers });
    // 01:00 EST to 04:00 EDT is 06:00Z to 08:00Z (two real hours).
    expect(whoIsOnCallAt(new Date('2026-03-08T05:59:00Z'), d).employeeId).toBe('A');
    expect(whoIsOnCallAt(new Date('2026-03-08T07:30:00Z'), d).employeeId).toBe('B');
    expect(whoIsOnCallAt(new Date('2026-03-08T08:00:00Z'), d).employeeId).toBe('A');
  });

  it.each(['12:00', '02:30', '01:30', '00:00'])(
    'segments are contiguous over both change nights with hand-over %s',
    (changesAt) => {
      const covers = [
        cover('c1', nj('2026-03-08', '01:00'), nj('2026-03-08', '04:00'), 'B'),
        cover('c2', new Date('2026-11-01T05:30:00Z'), new Date('2026-11-01T07:30:00Z'), 'C'),
      ];
      const d = data({ rotas: [rota(everyDay('A', 'X'), changesAt)], covers });
      for (const [from, to] of [
        [nj('2026-03-06', '09:00'), nj('2026-03-10', '09:00')],
        [nj('2026-10-30', '09:00'), nj('2026-11-03', '09:00')],
      ]) {
        const segs = segmentsBetween(from, to, d);
        expect(segs[0].startsAt).toEqual(from);
        expect(segs[segs.length - 1].endsAt).toEqual(to);
        for (let i = 1; i < segs.length; i++) expect(segs[i].startsAt).toEqual(segs[i - 1].endsAt);
        for (const s of segs) {
          expect(s.endsAt.getTime()).toBeGreaterThan(s.startsAt.getTime());
          expect(whoIsOnCallAt(s.startsAt, d)).toMatchObject({
            employeeId: s.employeeId,
            source: s.source,
          });
        }
      }
    },
  );
});

describe('segmentsBetween', () => {
  it('returns nothing for an empty or backwards range', () => {
    const at = nj('2026-06-01', '12:00');
    expect(segmentsBetween(at, at, data())).toEqual([]);
    expect(segmentsBetween(at, new Date(at.getTime() - 1), data())).toEqual([]);
  });

  it('splits at hand-overs, even when the same person has back-to-back turns', () => {
    const d = data({ rotas: [rota(everyDay('A'))] });
    const segs = segmentsBetween(nj('2026-06-01', '00:00'), nj('2026-06-03', '00:00'), d);
    expect(segs.map((s) => [s.turnDate, s.startsAt.toISOString()])).toEqual([
      ['2026-05-31', nj('2026-06-01', '00:00').toISOString()],
      ['2026-06-01', nj('2026-06-01', '12:00').toISOString()],
      ['2026-06-02', nj('2026-06-02', '12:00').toISOString()],
    ]);
  });

  it('splits at a cover edges and resumes the pattern', () => {
    const covers = [cover('c1', nj('2026-06-01', '18:00'), nj('2026-06-01', '23:00'), 'B')];
    const d = data({ rotas: [monAB()], covers });
    const segs = segmentsBetween(nj('2026-06-01', '12:00'), nj('2026-06-02', '12:00'), d);
    expect(segs.map((s) => [s.employeeId, s.source])).toEqual([
      ['A', 'USUAL'],
      ['B', 'COVER'],
      ['A', 'USUAL'],
    ]);
    expect(segs[1].startsAt).toEqual(nj('2026-06-01', '18:00'));
    expect(segs[1].endsAt).toEqual(nj('2026-06-01', '23:00'));
  });

  it('joins neighbours when a hidden overlapping cover changes nothing', () => {
    const covers = [
      cover(
        'big',
        nj('2026-06-01', '13:00'),
        nj('2026-06-01', '20:00'),
        'P',
        new Date('2026-05-02T00:00:00Z'),
      ),
      cover(
        'hidden',
        nj('2026-06-01', '15:00'),
        nj('2026-06-01', '16:00'),
        'Q',
        new Date('2026-05-01T00:00:00Z'),
      ),
    ];
    const d = data({ rotas: [monAB()], covers });
    const segs = segmentsBetween(nj('2026-06-01', '13:00'), nj('2026-06-01', '20:00'), d);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ employeeId: 'P', coverId: 'big' });
  });

  it('reports NONE stretches too', () => {
    const segs = segmentsBetween(nj('2026-06-01', '00:00'), nj('2026-06-01', '06:00'), data());
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ source: 'NONE', employeeId: null });
  });

  it('is quick over 60 days with 20 covers', () => {
    const covers = Array.from({ length: 20 }, (_, i) =>
      cover(
        `c${i}`,
        nj('2026-06-01', '18:00').valueOf() + i * 2 * 86_400_000 > 0
          ? new Date(nj('2026-06-01', '18:00').getTime() + i * 2 * 86_400_000)
          : new Date(),
        new Date(nj('2026-06-01', '22:00').getTime() + i * 2 * 86_400_000),
        `E${i}`,
      ),
    );
    const d = data({ rotas: [monAB()], covers, defaultProviderId: 'D' });
    const started = Date.now();
    const segs = segmentsBetween(nj('2026-06-01', '00:00'), nj('2026-07-31', '00:00'), d);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(segs.length).toBeGreaterThan(60);
    for (let i = 1; i < segs.length; i++) expect(segs[i].startsAt).toEqual(segs[i - 1].endsAt);
  });
});
