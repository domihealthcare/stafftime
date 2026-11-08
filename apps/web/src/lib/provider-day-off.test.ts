import { describe, expect, it } from 'vitest';
import {
  allAskedHaveSomeone,
  buildPerShift,
  coverageLine,
  defaultAction,
  defaultPicks,
  releasesLine,
  shiftWhen,
} from './provider-day-off';
import type { CoverOption, CoverOptions, ProviderDayOffShift } from './types';

const option = (id: string, over: Partial<CoverOption> = {}): CoverOption => ({
  employeeId: id,
  name: id,
  fit: 'good',
  hoursBefore: 0,
  hoursAfter: 8,
  hourly: true,
  overtime: 'ok',
  reasons: [],
  sameDay: [],
  current: false,
  ...over,
});
const cover = (options: CoverOption[]): CoverOptions => ({
  weekStart: '2026-11-15',
  thresholdHours: 40,
  options,
});
const person = (id: string, firstName = id) => ({
  id,
  firstName,
  preferredName: null,
  lastName: 'Smith',
});
const shift = (over: Partial<ProviderDayOffShift> = {}): ProviderDayOffShift => ({
  id: 's1',
  startsAt: '2026-11-17T14:00:00Z',
  endsAt: '2026-11-17T22:00:00Z',
  isRemote: false,
  locationName: 'North Bergen',
  jobRoleName: 'Provider',
  status: 'PUBLISHED',
  cover: null,
  ...over,
});

describe('per-shift defaults', () => {
  it('ticks the good fits and leaves the catches unticked', () => {
    const picks = defaultPicks(
      cover([option('a'), option('b', { fit: 'catch' }), option('c', { fit: 'cannot' })]),
    );
    expect([...picks]).toEqual(['a']);
  });

  it('asks for cover when somebody can be asked, else leaves it open', () => {
    expect(defaultAction(cover([option('a', { fit: 'catch' })]))).toBe('ASK');
    expect(
      defaultAction(cover([option('a', { fit: 'cannot' }), option('b', { current: true })])),
    ).toBe('OPEN');
    expect(defaultAction(null)).toBe('OPEN');
  });
});

describe('what is sent', () => {
  it('carries the ticked people only for Ask for cover', () => {
    const decisions = buildPerShift(
      [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
      { s1: 'ASK', s2: 'REMOVE', s3: 'KEEP' },
      { s1: new Set(['a', 'b']), s2: new Set(['a']) },
    );
    expect(decisions).toEqual([
      { shiftId: 's1', action: 'ASK', employeeIds: ['a', 'b'] },
      { shiftId: 's2', action: 'REMOVE' },
      { shiftId: 's3', action: 'KEEP' },
    ]);
  });

  it('will not approve an ask with nobody to ask', () => {
    expect(allAskedHaveSomeone([{ shiftId: 's', action: 'ASK', employeeIds: [] }])).toBe(false);
    expect(allAskedHaveSomeone([{ shiftId: 's', action: 'ASK', employeeIds: ['a'] }])).toBe(true);
    expect(allAskedHaveSomeone([{ shiftId: 's', action: 'OPEN' }])).toBe(true);
  });
});

describe('coverage lines', () => {
  it('says who covered it', () => {
    expect(
      coverageLine(
        shift({
          cover: { requestId: 'r', state: 'covered', takenBy: person('x', 'Ada'), asks: [] },
        }),
      ),
    ).toBe('Covered by Ada Smith');
  });

  it('counts those asked while waiting, and says nobody when all said no', () => {
    const asks = [
      { employee: person('a'), answer: null },
      { employee: person('b'), answer: false },
      { employee: person('c'), answer: null },
    ];
    expect(
      coverageLine(shift({ cover: { requestId: 'r', state: 'open', takenBy: null, asks } })),
    ).toBe('Asked 3, waiting');
    expect(
      coverageLine(
        shift({
          cover: {
            requestId: 'r',
            state: 'open',
            takenBy: null,
            asks: asks.map((ask) => ({ ...ask, answer: false })),
          },
        }),
      ),
    ).toBe('Nobody yet');
  });

  it('says removed, left open, and nobody yet for a stopped ask', () => {
    expect(coverageLine(shift({ status: 'CANCELLED' }))).toBe('Removed');
    expect(coverageLine(shift({ employeeId: null }))).toBe('Left open');
    expect(
      coverageLine(shift({ cover: { requestId: 'r', state: 'stopped', takenBy: null, asks: [] } })),
    ).toBe('Nobody yet');
  });
});

describe('times', () => {
  it('reads shifts on the practice clock', () => {
    expect(shiftWhen('2026-11-17T14:00:00Z', '2026-11-17T22:00:00Z')).toBe(
      'Tue, Nov 17, 9:00 AM–5:00 PM',
    );
  });

  it('warns about telemedicine released, and says nothing otherwise', () => {
    expect(releasesLine(undefined)).toBe('');
    expect(releasesLine([])).toBe('');
    expect(releasesLine(['Your telemedicine Tue, Nov 17 will be left open.'])).toBe(
      'Taking this would also free your telemedicine: Your telemedicine Tue, Nov 17 will be left open.',
    );
  });
});
