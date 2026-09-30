import { addDaysIso, planIntervals, runningBalances, toCents, totals } from './productivity-math';

describe('totals', () => {
  it("reproduces the practice's sheet: 169 + 154 against 300 at $50", () => {
    const result = totals(
      [
        { expected: 150, counts: [169] },
        { expected: 150, counts: [154] },
      ],
      '50.00',
    );
    expect(result).toEqual({
      expected: 300,
      actual: 323,
      difference: 23,
      multiplierCents: 5000,
      amountCents: 115_000,
    });
  });

  it('keeps a short period negative rather than flooring it', () => {
    const result = totals(
      [
        { expected: 150, counts: [74] },
        { expected: 150, counts: [210] },
      ],
      50,
    );
    expect(result.difference).toBe(-16);
    expect(result.amountCents).toBe(-80_000);
  });

  it('adds every category of an interval together', () => {
    const result = totals([{ expected: 100, counts: [60, 55] }], 10);
    expect(result).toMatchObject({ actual: 115, difference: 15, amountCents: 15_000 });
  });

  it('has only a count when there is no target and no multiplier', () => {
    expect(totals([{ expected: null, counts: [80] }], null)).toEqual({
      expected: null,
      actual: 80,
      difference: null,
      multiplierCents: null,
      amountCents: null,
    });
  });

  it('gives a target but no money when there is no multiplier', () => {
    const result = totals([{ expected: 150, counts: [160] }], null);
    expect(result).toMatchObject({ expected: 150, difference: 10, amountCents: null });
  });

  it('pays per patient counted when there is a multiplier but no target', () => {
    const result = totals([{ expected: null, counts: [40] }], '25.50');
    expect(result).toMatchObject({ expected: null, difference: null, amountCents: 102_000 });
  });

  it('counts an interval with no target as zero expected beside ones that have one', () => {
    const result = totals(
      [
        { expected: 150, counts: [100] },
        { expected: null, counts: [20] },
      ],
      1,
    );
    expect(result).toMatchObject({ expected: 150, actual: 120, difference: -30 });
  });

  it('does not drift on cents', () => {
    const result = totals([{ expected: 0, counts: [3] }], '12.35');
    expect(result.amountCents).toBe(3705);
  });
});

describe('toCents', () => {
  it.each([
    ['50', 5000],
    ['12.35', 1235],
    [0.1, 10],
    [null, null],
    [undefined, null],
  ])('%p → %p', (input, expected) => {
    expect(toCents(input as never)).toBe(expected);
  });
});

describe('planIntervals', () => {
  it('lays two two-week intervals end to end', () => {
    expect(planIntervals('2026-06-01', 2, 2)).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-14' },
      { startDate: '2026-06-15', endDate: '2026-06-28' },
    ]);
  });

  it('crosses a year end', () => {
    expect(addDaysIso('2026-12-28', 7)).toBe('2027-01-04');
  });
});

describe('runningBalances', () => {
  const carry = (amountCents: number | null) => ({ amountCents, carriesBalance: true });

  it('nets a shortfall off the next period: -$800 then +$4,700 pays $3,900', () => {
    expect(runningBalances([carry(-80_000), carry(470_000)])).toEqual([
      { carriedInCents: 0, payableCents: 0, carriedOutCents: -80_000 },
      { carriedInCents: -80_000, payableCents: 390_000, carriedOutCents: 0 },
    ]);
  });

  it('keeps carrying until it clears', () => {
    const [, second, third] = runningBalances([carry(-80_000), carry(30_000), carry(100_000)]);
    expect(second).toEqual({ carriedInCents: -80_000, payableCents: 0, carriedOutCents: -50_000 });
    expect(third).toEqual({ carriedInCents: -50_000, payableCents: 50_000, carriedOutCents: 0 });
  });

  it('pays a good period in full when nothing is owed', () => {
    expect(runningBalances([carry(115_000)])[0]).toEqual({
      carriedInCents: 0,
      payableCents: 115_000,
      carriedOutCents: 0,
    });
  });

  it('pays a negative as it stands, and starts again, when the statement does not carry', () => {
    const rows = runningBalances([
      carry(-80_000),
      { amountCents: -20_000, carriesBalance: false },
      carry(50_000),
    ]);
    expect(rows[1]).toEqual({ carriedInCents: 0, payableCents: -20_000, carriedOutCents: 0 });
    expect(rows[2].carriedInCents).toBe(0);
  });

  it('a statement with no money in it changes nothing', () => {
    const rows = runningBalances([carry(-80_000), carry(null), carry(100_000)]);
    expect(rows[1].payableCents).toBeNull();
    expect(rows[2]).toEqual({ carriedInCents: -80_000, payableCents: 20_000, carriedOutCents: 0 });
  });
});
