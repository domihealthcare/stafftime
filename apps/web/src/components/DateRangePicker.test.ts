import { describe, expect, it } from 'vitest';
import { presetRanges, toInstants } from './DateRangePicker';

describe('toInstants', () => {
  it("runs from New Jersey's midnight to the midnight after the last day", () => {
    // Whatever zone the browser is in: CI's is UTC.
    expect(toInstants({ from: '2026-10-25', to: '2026-10-31' })).toEqual({
      from: '2026-10-25T04:00:00.000Z',
      // 1 November: the clocks went back at 2am, after this midnight.
      to: '2026-11-01T04:00:00.000Z',
    });
    expect(toInstants({ from: '2026-12-01', to: '2026-12-01' })).toEqual({
      from: '2026-12-01T05:00:00.000Z',
      to: '2026-12-02T05:00:00.000Z',
    });
  });
});

describe('presetRanges', () => {
  it('works out the weeks and months from the day it is given', () => {
    const presets = presetRanges(null, new Date('2026-10-29T00:00:00'));
    const range = (key: string) => presets.find((preset) => preset.key === key)?.range;
    expect(range('this-week')).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(range('last-week')).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(range('this-month')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});
