import { onCallInside, onCallWords, problemWithChoices, ShiftChoice } from './provider-day-off';

const NOW = new Date('2026-11-08T15:00:00Z');
const REQUEST = {
  employeeId: 'prov-1',
  startDate: new Date('2026-11-10T00:00:00Z'),
  endDate: new Date('2026-11-11T00:00:00Z'),
};
// Tue Nov 10, 9am to 5pm New Jersey (EST: UTC-5).
const shift = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  employeeId: 'prov-1',
  startsAt: new Date('2026-11-10T14:00:00Z'),
  endsAt: new Date('2026-11-10T22:00:00Z'),
  status: 'PUBLISHED',
  ...over,
});
const choose = (action: ShiftChoice['action'], over: Partial<ShiftChoice> = {}): ShiftChoice => ({
  shiftId: 's1',
  action,
  ...over,
});

describe('problemWithChoices', () => {
  it('accepts their own shifts inside the days, still to come', () => {
    expect(problemWithChoices([choose('OPEN')], [shift()], REQUEST, NOW)).toBeNull();
    expect(
      problemWithChoices([choose('ASK', { employeeIds: ['a'] })], [shift()], REQUEST, NOW),
    ).toBeNull();
  });

  it("refuses somebody else's shift, one that is not there, and cancelled ones", () => {
    expect(
      problemWithChoices([choose('KEEP')], [shift({ employeeId: 'x' })], REQUEST, NOW),
    ).toMatch(/not theirs/);
    expect(problemWithChoices([choose('KEEP')], [], REQUEST, NOW)).toMatch(/not theirs/);
    expect(
      problemWithChoices([choose('KEEP')], [shift({ status: 'CANCELLED' })], REQUEST, NOW),
    ).toMatch(/cancelled/);
  });

  it('refuses shifts outside the dates', () => {
    const late = shift({
      startsAt: new Date('2026-11-12T14:00:00Z'),
      endsAt: new Date('2026-11-12T22:00:00Z'),
    });
    expect(problemWithChoices([choose('REMOVE')], [late], REQUEST, NOW)).toMatch(/outside/);
  });

  it("counts the last day as the practice's evening, not UTC midnight", () => {
    // 7pm on the 11th in New Jersey is already the 12th in UTC.
    const evening = shift({
      startsAt: new Date('2026-11-12T00:00:00Z'),
      endsAt: new Date('2026-11-12T03:00:00Z'),
    });
    expect(problemWithChoices([choose('REMOVE')], [evening], REQUEST, NOW)).toBeNull();
  });

  it('refuses shifts that have started, twice-chosen shifts and an ask with nobody', () => {
    expect(
      problemWithChoices([choose('OPEN')], [shift()], REQUEST, new Date('2026-11-10T15:00:00Z')),
    ).toMatch(/started/);
    expect(problemWithChoices([choose('OPEN'), choose('KEEP')], [shift()], REQUEST, NOW)).toMatch(
      /once/,
    );
    expect(problemWithChoices([choose('ASK')], [shift()], REQUEST, NOW)).toMatch(/who to ask/);
    expect(
      problemWithChoices([choose('ASK', { employeeIds: [] })], [shift()], REQUEST, NOW),
    ).toMatch(/who to ask/);
  });
});

describe('on-call dates', () => {
  it('keeps those inside the days, once, in order', () => {
    expect(
      onCallInside(
        ['2026-11-12', '2026-11-10', '2026-11-10', '2026-11-11'],
        REQUEST.startDate,
        REQUEST.endDate,
      ),
    ).toEqual(['2026-11-10', '2026-11-11']);
  });

  it('asks the provider to swap, in words', () => {
    const one = onCallWords(['2026-11-10']);
    expect(one.body).toBe(
      'Your time off is approved, but you are on call Tue, Nov 10. Please ask a colleague to swap that day on the On call page.',
    );
    const two = onCallWords(['2026-11-10', '2026-11-11']);
    expect(two.body).toContain('Tue, Nov 10 and Wed, Nov 11');
    expect(two.body).toContain('those days');
  });
});
