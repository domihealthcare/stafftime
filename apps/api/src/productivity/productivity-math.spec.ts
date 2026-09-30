import { addDaysIso, planIntervals, toCents, totals } from './productivity-math';

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
