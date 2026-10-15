import { closedFor, countedDays, loadClosedDays, skippedDays } from './counted-days';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('countedDays', () => {
  it('counts weekdays only', () => {
    // Wednesday 21 to Wednesday 28 October 2026: 6 weekdays.
    expect(
      countedDays(
        { startDate: day('2026-10-21'), endDate: day('2026-10-28'), isHalfDay: false },
        new Set(),
      ),
    ).toBe(6);
  });

  it('skips the days in `closed`', () => {
    expect(
      countedDays(
        { startDate: day('2026-12-21'), endDate: day('2026-12-25'), isHalfDay: false },
        new Set(['2026-12-25']),
      ),
    ).toBe(4);
  });

  it('counts a half day on a weekday as half, and on a weekend as nothing', () => {
    const half = (date: string) => ({ startDate: day(date), endDate: day(date), isHalfDay: true });
    expect(countedDays(half('2026-10-21'), new Set())).toBe(0.5);
    expect(countedDays(half('2026-10-24'), new Set())).toBe(0);
  });

  it('counts only the part inside a year', () => {
    const request = { startDate: day('2026-12-30'), endDate: day('2027-01-05'), isHalfDay: false };
    expect(countedDays(request, new Set(), day('2027-01-01'), day('2028-01-01'))).toBe(3);
  });
});

describe('skippedDays', () => {
  it('says how many weekend days, and which weekdays were closed', () => {
    expect(
      skippedDays(
        { startDate: day('2026-12-21'), endDate: day('2026-12-28') },
        new Set(['2026-12-25']),
      ),
    ).toEqual({ weekend: 2, closed: ['2026-12-25'] });
  });
});

describe('closedFor', () => {
  const closed = {
    everywhere: new Set(['2026-12-25']),
    byOffice: new Map([
      ['nb', new Set(['2026-12-21', '2026-12-22'])],
      ['wny', new Set(['2026-12-22'])],
    ]),
  };

  it('is the days closed everywhere, and those closed at every one of their offices', () => {
    expect([...closedFor(closed, ['nb'])].sort()).toEqual([
      '2026-12-21',
      '2026-12-22',
      '2026-12-25',
    ]);
    expect([...closedFor(closed, ['nb', 'wny'])].sort()).toEqual(['2026-12-22', '2026-12-25']);
    expect([...closedFor(closed, [])]).toEqual(['2026-12-25']);
  });
});

describe('loadClosedDays', () => {
  function prismaWith(closures: unknown[]) {
    return { practiceEvent: { findMany: jest.fn().mockResolvedValue(closures) } } as never;
  }

  it('takes whole days only: an all-day closure, not an early close', async () => {
    const closed = await loadClosedDays(
      prismaWith([
        {
          // Christmas Day, all day in New Jersey (EST).
          startsAt: new Date('2026-12-25T05:00:00.000Z'),
          endsAt: new Date('2026-12-26T05:00:00.000Z'),
          audience: 'EVERYONE',
          locationId: null,
        },
        {
          // Christmas Eve from 1pm.
          startsAt: new Date('2026-12-24T18:00:00.000Z'),
          endsAt: new Date('2026-12-25T05:00:00.000Z'),
          audience: 'EVERYONE',
          locationId: null,
        },
        {
          startsAt: new Date('2026-12-21T05:00:00.000Z'),
          endsAt: new Date('2026-12-22T05:00:00.000Z'),
          audience: 'LOCATION',
          locationId: 'nb',
        },
      ]),
      '2026-12-01',
      '2026-12-31',
    );
    expect([...closed.everywhere]).toEqual(['2026-12-25']);
    expect([...(closed.byOffice.get('nb') ?? [])]).toEqual(['2026-12-21']);
  });

  it('keeps to the range asked about', async () => {
    const closed = await loadClosedDays(
      prismaWith([
        {
          startsAt: new Date('2026-12-21T05:00:00.000Z'),
          endsAt: new Date('2027-01-02T05:00:00.000Z'),
          audience: 'EVERYONE',
          locationId: null,
        },
      ]),
      '2026-12-30',
      '2027-01-10',
    );
    expect([...closed.everywhere]).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });
});
